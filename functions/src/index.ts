import Busboy from "busboy"
import cors from "cors"
import express from "express"
import * as admin from "firebase-admin"
import * as functions from "firebase-functions"
import * as fs from "fs"
import { createReadStream } from "fs"
import { OpenAI } from "openai"
import * as os from "os"
import * as path from "path"
import crypto from "crypto"

// Initialize Firebase Admin with emulator connection when running locally
const adminConfig = process.env.FUNCTIONS_EMULATOR
    ? {
          projectId: "demo-docnote-e7f1e",
          // Connect to Firestore emulator
          firestore: {
              host: "localhost",
              port: 9080
          },
          storageBucket: "demo-docnote-e7f1e.firebasestorage.app"
      }
    : {
          storageBucket: "demo-docnote-e7f1e.firebasestorage.app"
      }

admin.initializeApp(adminConfig)
// Initialize Firestore
const db = admin.firestore()
const recordingsCollection = db.collection("recordings")

// Add deduplication map here
const requestDeduplicationMap = new Map<
    string,
    {
        timestamp: number
        recordingId: string
    }
>()
// OpenAI client type
let openai: OpenAI | null = null

// File data interface
interface FileData {
    fieldname: string
    originalname: string
    mimetype: string
    path: string
    encoding: string
    size?: number
}

// Recording document interface
interface RecordingDocument {
    filename: string
    path: string
    storageUrl?: string // Add URL from Firebase Storage
    size: number
    uploadedAt: FirebaseFirestore.Timestamp | FirebaseFirestore.FieldValue | { seconds: number; nanoseconds: number }
    transcript?: string
    recommendations?: string
    userId?: string
    metadata?: Record<string, any>
}

// Directory to store temporary chunk files
const chunksDir = path.join(__dirname, "../chunks")
if (!fs.existsSync(chunksDir)) {
    fs.mkdirSync(chunksDir, { recursive: true })
}

// Sessions map to track uploaded chunks
interface ChunkInfo {
    path: string
    size: number
    chunkNumber: number
}

interface ChunkSession {
    sessionId: string
    chunks: Map<number, ChunkInfo>
    totalChunks: number
    originalFilename: string
    mimeType: string
    createdAt: number
}

// Store sessions in memory (in production, use a persistent store like Firestore)
const chunkSessions = new Map<string, ChunkSession>()

// Clean up old sessions periodically (30 minutes)
setInterval(() => {
    const now = Date.now()
    const SESSION_EXPIRY = 30 * 60 * 1000 // 30 minutes

    console.log("[DEBUG] Cleaning up expired chunk sessions")
    for (const [sessionId, session] of chunkSessions.entries()) {
        if (now - session.createdAt > SESSION_EXPIRY) {
            console.log(`[DEBUG] Removing expired session: ${sessionId}`)

            // Delete all chunk files for this session
            for (const chunk of Array.from(session.chunks.values()) as ChunkInfo[]) {
                try {
                    if (fs.existsSync(chunk.path)) {
                        fs.unlinkSync(chunk.path)
                        console.log(`[DEBUG] Deleted chunk file: ${chunk.path}`)
                    }
                } catch (error) {
                    console.error(`[DEBUG] Error deleting chunk file: ${error}`)
                }
            }

            // Remove session from map
            chunkSessions.delete(sessionId)
        }
    }
}, 5 * 60 * 1000) // Run every 5 minutes

// Function to initialize OpenAI with API key from environment
function initializeOpenAI(): OpenAI {
    if (!openai) {
        // Get API key from environment variable
        const apiKey = process.env.OPENAI_API_KEY

        if (!apiKey) {
            console.error("[ERROR] OPENAI_API_KEY environment variable is not set")
            throw new Error("OpenAI API key not configured. Please set OPENAI_API_KEY environment variable.")
        }

        openai = new OpenAI({
            apiKey: apiKey
        })
        console.log("[DEBUG] OpenAI client initialized")
    }
    return openai
}

// Helper function to generate a unique signature for request deduplication
function generateRequestSignature(req: express.Request, fileData?: FileData): string {
    // If both requestId and clientId are provided, use those as the primary key
    const requestId = req.headers["x-request-id"] || req.query.requestId
    const clientId = req.headers["x-client-id"] || req.query.clientId

    if (requestId && clientId) {
        console.log(`[DEBUG] Using provided IDs for signature: ${clientId}:${requestId}`)
        // Creating a consistent hash for these values
        return crypto.createHash("md5").update(`${clientId}-${requestId}`).digest("hex")
    }

    // Fallback to the previous approach
    const userId = (req as any).user?.uid || "anonymous"
    const fileSize = fileData?.size || 0

    // Build fingerprint components
    const components = [userId, fileSize.toString(), clientId?.toString() || "", requestId?.toString() || ""]

    // Get a timestamp window (rounded to nearest 5 seconds)
    const timeWindow = Math.floor(Date.now() / 5000) * 5
    components.push(timeWindow.toString())

    // Create hash from components
    const fingerprint = crypto.createHash("md5").update(components.join("-")).digest("hex")

    console.log(`[DEBUG] Generated fallback request fingerprint: ${fingerprint}`)
    return fingerprint
}
const app = express()

// Middleware
app.use(cors({ origin: true }))

// Ensure audio directory exists
const audioDir = path.join(__dirname, "../audio")
if (!fs.existsSync(audioDir)) {
    fs.mkdirSync(audioDir, { recursive: true })
}

// Simple test endpoint
app.get("/test", (req: express.Request, res: express.Response) => {
    res.status(200).send("Audio upload service is running")
})

// Helper function to transcribe audio using OpenAI API
async function transcribeAudio(audioFilePath: string): Promise<string> {
    console.log(`[DEBUG] Transcribing audio from: ${audioFilePath}`)

    try {
        // Check if file exists
        if (!fs.existsSync(audioFilePath)) {
            throw new Error(`Audio file does not exist at path: ${audioFilePath}`)
        }

        // Get file stats
        const stats = fs.statSync(audioFilePath)
        console.log(`[DEBUG] Audio file size: ${stats.size} bytes`)

        if (stats.size === 0) {
            throw new Error("Audio file is empty (0 bytes)")
        }

        // Check file extension
        const fileExt = path.extname(audioFilePath).toLowerCase()
        console.log(`[DEBUG] Audio file extension: ${fileExt}`)

        // Validate that the file extension is supported by OpenAI
        const supportedFormats = [".flac", ".m4a", ".mp3", ".mp4", ".mpeg", ".mpga", ".oga", ".ogg", ".wav", ".webm"]
        if (!supportedFormats.includes(fileExt)) {
            console.log(
                `[DEBUG] File extension ${fileExt} may not be supported. Supported formats: ${supportedFormats.join(
                    ", "
                )}`
            )
        }

        // Initialize OpenAI if needed
        const client = initializeOpenAI()

        // Create a readable stream for the file
        console.log(`[DEBUG] Creating read stream for audio file`)
        const fileStream = createReadStream(audioFilePath)

        // Transcribe using OpenAI API
        console.log(`[DEBUG] Sending transcription request to OpenAI API`)
        const transcript = await client.audio.transcriptions.create({
            file: fileStream,
            model: "whisper-1",
            language: "en"
        })

        console.log(`[DEBUG] Transcription successful, length: ${transcript.text.length} characters`)
        return transcript.text
    } catch (error: any) {
        console.error(`[DEBUG] Transcription error details:`, error)

        // Provide more detailed error information
        if (error.response) {
            console.error(`[DEBUG] OpenAI API error status: ${error.response.status}`)
            console.error(`[DEBUG] OpenAI API error data:`, error.response.data)
        }

        throw new Error(`Failed to transcribe audio: ${error.message}`)
    }
}

// Helper function to get medical recommendations based on transcript
async function getMedicalRecommendations(transcript: string): Promise<string> {
    try {
        const client = new OpenAI()

        // Split transcript into paragraphs for embedding
        const paragraphs = transcript.split(/\n\s*\n/).filter((p) => p.trim() !== "")

        // Create embeddings for each paragraph
        console.debug(`Creating embeddings for ${paragraphs.length} transcript paragraphs...`)
        const embeddingResponse = await client.embeddings.create({
            model: "text-embedding-3-small",
            input: paragraphs
        })
        const embeddings = embeddingResponse.data.map((e) => e.embedding)
        console.debug(`Successfully created ${embeddings.length} embeddings.`)

        // Define search function to find relevant transcript parts
        const searchTranscript = async (query: string, count = 3): Promise<string[]> => {
            // Get embedding for the query
            const queryEmbeddingResponse = await client.embeddings.create({
                model: "text-embedding-3-small",
                input: query
            })
            const queryEmbedding = queryEmbeddingResponse.data[0].embedding

            // Calculate similarity with each paragraph
            const similarities = embeddings.map((embedding, index) => {
                const similarity = cosineSimilarity(queryEmbedding, embedding)
                return { index, similarity }
            })

            // Sort by similarity (descending) and get top results
            const topResults = similarities
                .sort((a, b) => b.similarity - a.similarity)
                .slice(0, count)
                .map((result) => paragraphs[result.index])

            return topResults
        }

        // Get relevant transcript parts for important medical topics
        const symptomSearch = await searchTranscript("patient symptoms and complaints", 3)
        const treatmentSearch = await searchTranscript("treatment plan", 2)

        // Create system message for chat
        const systemMessage = `You are a medical assistant analyzing a doctor-patient conversation.
Your task is to create a comprehensive medical report based on the transcript provided.
Be thorough, specific, and medical in your analysis.`

        // Create user message with transcript excerpts
        const userMessage = `Please analyze this patient transcript and create a detailed medical report.
Here are the most relevant parts of the transcript:

PATIENT SYMPTOMS:
${symptomSearch.map((s) => `"${s}"`).join("\n\n")}



TREATMENT PLAN:
${treatmentSearch.map((s) => `"${s}"`).join("\n\n")}

Your report should include:
1. Key complaints from the patient
2. Possible diagnosis, with clear reasoning
3. Recommended tests, if applicable
4. Treatment suggestions
5. Any notable items for follow-up`

        // Use the new responses API
        console.debug("Making request to the OpenAI Responses API...")
        const response = await client.responses.create({
            model: "gpt-4.1",
            input: [
                { role: "system", content: systemMessage },
                { role: "user", content: userMessage }
            ]
        })

        // Get the response content
        const responseContent = response.output_text || ""

        console.debug("Successfully generated medical recommendations.")
        return responseContent
    } catch (error) {
        console.error("Error generating medical recommendations:", error)
        throw new Error(`Failed to generate medical recommendations: ${error}`)
    }
}

// Helper function to calculate cosine similarity
function cosineSimilarity(a: number[], b: number[]): number {
    let dotProduct = 0
    let normA = 0
    let normB = 0

    for (let i = 0; i < a.length; i++) {
        dotProduct += a[i] * b[i]
        normA += a[i] * a[i]
        normB += b[i] * b[i]
    }

    normA = Math.sqrt(normA)
    normB = Math.sqrt(normB)

    return dotProduct / (normA * normB)
}

// Helper function to create a Firestore timestamp
function createFirestoreTimestamp():
    | FirebaseFirestore.Timestamp
    | FirebaseFirestore.FieldValue
    | { seconds: number; nanoseconds: number } {
    console.log("[DEBUG] Creating Firestore timestamp")

    try {
        // First try: Use FieldValue.serverTimestamp()
        if (admin && admin.firestore && admin.firestore.FieldValue) {
            console.log("[DEBUG] Using admin.firestore.FieldValue.serverTimestamp()")
            return admin.firestore.FieldValue.serverTimestamp()
        }
    } catch (error) {
        console.log("[DEBUG] Error with FieldValue.serverTimestamp():", error)
    }

    try {
        // Second try: Use Firestore admin Timestamp
        if (admin && admin.firestore && admin.firestore.Timestamp) {
            console.log("[DEBUG] Using admin.firestore.Timestamp.now()")
            return admin.firestore.Timestamp.now()
        }
    } catch (error) {
        console.log("[DEBUG] Error with Firestore.Timestamp.now():", error)
    }

    try {
        // Third try: Use Timestamp.fromDate()
        if (admin && admin.firestore && admin.firestore.Timestamp) {
            const now = new Date()
            console.log("[DEBUG] Using admin.firestore.Timestamp.fromDate() with:", now)
            return admin.firestore.Timestamp.fromDate(now)
        }
    } catch (error) {
        console.log("[DEBUG] Error with Timestamp.fromDate():", error)
    }

    // Last resort: Create a timestamp-like object manually
    const now = new Date()
    const manualTimestamp = {
        seconds: Math.floor(now.getTime() / 1000),
        nanoseconds: now.getMilliseconds() * 1000000
    }
    console.log("[DEBUG] Using manual timestamp object:", manualTimestamp)
    return manualTimestamp
}

// Helper function to save recording info to Firestore
async function saveRecordingToFirestore(recordingData: RecordingDocument): Promise<string> {
    try {
        console.log("[DEBUG] Saving recording data to Firestore")

        // Don't create timestamp here - use the one passed in recordingData
        // or create a new one if needed
        if (!recordingData.uploadedAt) {
            recordingData.uploadedAt = createFirestoreTimestamp()
        }

        const docRef = await recordingsCollection.add(recordingData)

        console.log(`[DEBUG] Recording saved to Firestore with ID: ${docRef.id}`)
        return docRef.id
    } catch (error: any) {
        console.error(`[DEBUG] Error saving to Firestore: ${error.message}`)
        throw new Error(`Failed to save recording to database: ${error.message}`)
    }
}

// Helper function to upload file to Firebase Storage
async function uploadToFirebaseStorage(filePath: string, fileName: string, contentType: string): Promise<string> {
    console.log(`[DEBUG] Uploading file to Firebase Storage: ${fileName}`)

    try {
        // Initialize storage bucket
        const bucket = admin.storage().bucket()

        // Upload file to Firebase Storage
        await bucket.upload(filePath, {
            destination: `audio/${fileName}`,
            metadata: {
                contentType: contentType,
                metadata: {
                    firebaseStorageDownloadTokens: fileName // Custom token for easier access
                }
            }
        })

        // Get the public URL
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/audio/${fileName}`
        console.log(`[DEBUG] File uploaded to Firebase Storage: ${publicUrl}`)

        return publicUrl
    } catch (error) {
        console.error("[DEBUG] Error uploading to Firebase Storage:", error)
        throw error
    }
}

// Endpoint to process audio file, get transcription and medical recommendations
app.post("/process-medical-audio", async (req: express.Request, res: express.Response) => {
    console.log("[DEBUG] Received medical audio processing request")
    console.log("[DEBUG] Query params:", req.query)

    if (!req.headers["content-type"]) {
        return res.status(400).json({
            success: false,
            message: "Missing Content-Type header"
        })
    }

    console.log(`[DEBUG] Content-Type: ${req.headers["content-type"]}`)

    try {
        // ADD THIS DEDUPLICATION CHECK HERE
        // Generate initial signature based on request headers
        const initialSignature = generateRequestSignature(req)

        // Check if we've seen this request recently (within 30 seconds)
        const existingRequest = requestDeduplicationMap.get(initialSignature)
        if (existingRequest) {
            const timeElapsed = Date.now() - existingRequest.timestamp
            if (timeElapsed < 30000) {
                // Within 30 seconds
                console.log(`[DEBUG] Detected duplicate request within ${timeElapsed}ms, returning cached response`)
                return res.status(200).json({
                    success: true,
                    message: "Request already processed",
                    recordingId: existingRequest.recordingId,
                    isDuplicate: true,
                    originalTimestamp: new Date(existingRequest.timestamp).toISOString()
                })
            }
            // If it's older than 30 seconds, process normally but log it
            console.log(`[DEBUG] Found similar request from ${timeElapsed}ms ago, but outside deduplication window`)
        }

        // ORIGINAL CODE CONTINUES HERE - All your existing file processing code
        // Store file details
        let fileData: FileData | null = null

        // Use busboy for file upload with proper type assertion
        const bb = Busboy({
            headers: req.headers,
            limits: {
                fileSize: 50 * 1024 * 1024 // 50MB
            }
        })

        // Set up file upload promise
        let apiKey: string | null = null

        await new Promise<void>((resolve, reject) => {
            // Initialize file write promise
            let fileWritePromise: Promise<void> | null = null

            // Handle file upload
            bb.on("file", (fieldname: string, fileStream: NodeJS.ReadableStream, info: any) => {
                console.log(`[DEBUG] Processing file [${fieldname}]: ${info.filename}`)

                if (fieldname !== "audio") {
                    console.log(`[DEBUG] Skipping file with fieldname: ${fieldname}, expected 'audio'`)
                    fileStream.resume()
                    return
                }

                // Create temp directory if it doesn't exist
                const tmpdir = os.tmpdir()

                // Create temporary file path
                const tmpFilePath = path.join(tmpdir, `${Date.now()}-${info.filename}`)
                console.log(`[DEBUG] Saving to temp path: ${tmpFilePath}`)

                // Create file data object
                fileData = {
                    fieldname,
                    originalname: info.filename,
                    mimetype: info.mimeType,
                    path: tmpFilePath,
                    encoding: info.encoding
                }

                // Create write stream to temp file
                const writeStream = fs.createWriteStream(tmpFilePath)

                // Create a separate promise for file writing
                fileWritePromise = new Promise<void>((resolveFile, rejectFile) => {
                    // File has been fully written
                    writeStream.on("finish", () => {
                        console.log(`[DEBUG] File write completed to: ${tmpFilePath}`)
                        // Verify file exists and has size
                        try {
                            const stats = fs.statSync(tmpFilePath)
                            if (fileData) {
                                fileData.size = stats.size
                            }
                            console.log(`[DEBUG] File size: ${stats.size} bytes`)
                            resolveFile()
                        } catch (error: any) {
                            console.error(`[DEBUG] Error checking file stats: ${error.message}`)
                            rejectFile(error)
                        }
                    })

                    // Error writing file
                    writeStream.on("error", (error: Error) => {
                        console.error(`[DEBUG] Error writing file: ${error.message}`)
                        rejectFile(error)
                    })
                })

                // Pipe file data to the temporary file
                fileStream.pipe(writeStream)
            })

            // Handle form fields
            bb.on("field", (fieldname: string, value: string) => {
                console.log(`[DEBUG] Field [${fieldname}]: ${value}`)
                if (fieldname === "apiKey") {
                    apiKey = value
                    console.log("[DEBUG] Received OpenAI API key")
                }
            })

            // Handle parsing completion
            bb.on("close", async () => {
                console.log("[DEBUG] Busboy close event fired")

                // Make sure file was written completely before resolving
                if (fileWritePromise) {
                    try {
                        await fileWritePromise
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    // No file was processed
                    resolve()
                }
            })

            // Handle parsing errors
            bb.on("error", (error: Error) => {
                console.error(`[DEBUG] Busboy error: ${error.message}`)
                reject(error)
            })

            // Process rawBody if available or pipe the request
            if ((req as any).rawBody) {
                console.log("[DEBUG] Using req.rawBody for processing")
                bb.end((req as any).rawBody)
            } else {
                console.log("[DEBUG] Piping request to busboy")
                req.pipe(bb)
            }
        })

        // Process the uploaded file
        if (!fileData) {
            return res.status(400).json({
                success: false,
                message: "No audio file uploaded"
            })
        }

        // At this point, fileData is definitely not null, but TypeScript doesn't know that
        // Use a non-null assertion to tell TypeScript this is safe
        const processedFileData = fileData as FileData

        // Verify file exists - TypeScript now knows fileData is not null
        if (!fs.existsSync(processedFileData.path)) {
            return res.status(500).json({
                success: false,
                message: "File failed to upload properly"
            })
        }

        // Setup OpenAI with provided API key if available
        if (apiKey) {
            console.log("[DEBUG] Using API key from request")
            openai = new OpenAI({
                apiKey: apiKey
            })
        } else {
            // Use default API key
            console.log("[DEBUG] Using default API key")
            initializeOpenAI()
        }

        // Create final file name and path
        const fileExt = path.extname(processedFileData.originalname)
        const fileName = `${Date.now()}${fileExt}`

        // Upload file to Firebase Storage
        console.log("[DEBUG] Uploading file to Firebase Storage")
        const storageUrl = await uploadToFirebaseStorage(processedFileData.path, fileName, processedFileData.mimetype)

        // Step 1: Transcribe the audio
        console.log("[DEBUG] Starting audio transcription")
        const transcript = await transcribeAudio(processedFileData.path)

        // Step 2: Get medical recommendations based on the transcript
        console.log("[DEBUG] Getting medical recommendations")
        const recommendations = await getMedicalRecommendations(transcript)

        // Create timestamp using a safe method
        console.log("[DEBUG] Creating timestamp for recording")
        let uploadedAt
        try {
            // Try using FieldValue.serverTimestamp() for better compatibility with emulator
            if (req.query.useEmulator === "true") {
                console.log("[DEBUG] Using manual timestamp for emulator")
                // Create a regular JavaScript Date and then convert it to a Firestore Timestamp
                const now = new Date()
                console.log("[DEBUG] Created JavaScript Date:", now)
                // Check if admin and admin.firestore are defined
                if (admin && admin.firestore && admin.firestore.Timestamp) {
                    uploadedAt = admin.firestore.Timestamp.fromDate(now)
                    console.log("[DEBUG] Successfully created Firestore timestamp from Date")
                } else {
                    console.log("[DEBUG] admin.firestore.Timestamp is not available, using server timestamp")
                    uploadedAt = admin.firestore.FieldValue.serverTimestamp()
                }
            } else {
                uploadedAt = createFirestoreTimestamp()
            }
        } catch (error) {
            console.log("[DEBUG] Error creating timestamp, using manual object fallback", error)
            // As a last resort, create a timestamp-like object manually
            const now = new Date()
            uploadedAt = {
                seconds: Math.floor(now.getTime() / 1000),
                nanoseconds: now.getMilliseconds() * 1000000
            }
            console.log("[DEBUG] Created manual timestamp-like object:", uploadedAt)
        }
        console.log("[DEBUG] Created timestamp:", uploadedAt)

        // Step 3: Save recording info to Firestore
        const recordingData: RecordingDocument = {
            filename: fileName,
            path: `audio/${fileName}`,
            storageUrl: storageUrl,
            size: processedFileData.size || 0,
            uploadedAt,
            transcript,
            recommendations,
            userId: (req as any).user?.uid || null, // If using Firebase Auth
            metadata: {
                originalFilename: processedFileData.originalname,
                mimeType: processedFileData.mimetype
            }
        }

        const recordingId = await saveRecordingToFirestore(recordingData)
        requestDeduplicationMap.set(initialSignature, {
            timestamp: Date.now(),
            recordingId: recordingId
        })

        // Set a timeout to clean up this entry after 30 seconds
        setTimeout(() => {
            requestDeduplicationMap.delete(initialSignature)
            console.log(`[DEBUG] Removed request signature from deduplication map: ${initialSignature}`)
        }, 30000)

        // Clean up temp file
        try {
            fs.unlinkSync(processedFileData.path)
            console.log(`[DEBUG] Deleted temp file: ${processedFileData.path}`)
        } catch (err) {
            console.error(`[DEBUG] Failed to delete temp file: ${processedFileData.path}`, err)
        }

        // Return response
        return res.status(200).json({
            success: true,
            message: "Audio processed successfully",
            recordingId,
            file: {
                filename: fileName,
                path: `audio/${fileName}`,
                storageUrl: storageUrl,
                size: processedFileData.size
            },
            transcript,
            recommendations
        })
    } catch (error: any) {
        console.error("[DEBUG] Error processing upload:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to process upload",
            error: error.message
        })
    }
})

// POST endpoint to upload audio files and process with OpenAI
app.post("/upload-audio", async (req: express.Request, res: express.Response) => {
    console.log("[DEBUG] Received upload request")
    console.log("[DEBUG] Query params:", req.query)

    if (!req.headers["content-type"]) {
        return res.status(400).json({
            success: false,
            message: "Missing Content-Type header"
        })
    }

    console.log(`[DEBUG] Content-Type: ${req.headers["content-type"]}`)

    try {
        // Store file details
        let fileData: FileData | null = null
        let skipAI = false // Flag to skip AI processing if requested

        // Check if AI processing should be skipped
        if (req.query.skipAI === "true") {
            skipAI = true
            console.log("[DEBUG] AI processing will be skipped")
        }

        // Parse the multipart data using busboy
        await new Promise<void>((resolve, reject) => {
            // Handle file too large
            if (req.headers["content-length"] && parseInt(req.headers["content-length"]) > 50 * 1024 * 1024) {
                return reject(new Error("File too large (max 50MB)"))
            }

            // Create busboy instance
            const bb = Busboy({
                headers: req.headers,
                limits: {
                    fileSize: 50 * 1024 * 1024 // 50MB
                }
            })

            // Initialize file write promise
            let fileWritePromise: Promise<void> | null = null

            // Handle file upload
            bb.on("file", (fieldname: string, fileStream: NodeJS.ReadableStream, info: any) => {
                console.log("[DEBUG] Busboy file event fired")
                console.log(`[DEBUG] Field: ${fieldname}`)
                console.log(`[DEBUG] Filename: ${info.filename}`)
                console.log(`[DEBUG] Encoding: ${info.encoding}`)
                console.log(`[DEBUG] MimeType: ${info.mimeType}`)

                if (fieldname !== "audio") {
                    console.log(`[DEBUG] Skipping non-audio field: ${fieldname}, expected 'audio'`)
                    fileStream.resume() // Skip this file
                    return
                }

                // Create a temporary file
                const tmpFilePath = path.join(os.tmpdir(), `${Date.now()}-${info.filename}`)
                console.log(`[DEBUG] Created temporary file path: ${tmpFilePath}`)

                // Store file data for later
                fileData = {
                    fieldname,
                    originalname: info.filename,
                    mimetype: info.mimeType,
                    encoding: info.encoding,
                    path: tmpFilePath
                }

                console.log(`[DEBUG] Creating write stream: ${tmpFilePath}`)
                const writeStream = fs.createWriteStream(tmpFilePath)

                // Track file write completion
                fileWritePromise = new Promise<void>((resolveFile, rejectFile) => {
                    writeStream.on("finish", () => {
                        console.log(`[DEBUG] File write complete: ${tmpFilePath}`)

                        // Get file size
                        try {
                            const stats = fs.statSync(tmpFilePath)
                            if (fileData) {
                                fileData.size = stats.size
                                console.log(`[DEBUG] File size: ${stats.size} bytes`)
                            }
                            resolveFile()
                        } catch (err) {
                            console.error(`[DEBUG] Error getting file stats: ${err}`)
                            rejectFile(err)
                        }
                    })

                    writeStream.on("error", (error) => {
                        console.error(`[DEBUG] Error writing file: ${error}`)
                        rejectFile(error)
                    })
                })

                // Save the data to disk
                fileStream.pipe(writeStream)
            })

            // Handle parsing completion
            bb.on("close", async () => {
                console.log("[DEBUG] Busboy close event fired")

                // Make sure file was written completely before resolving
                if (fileWritePromise) {
                    try {
                        await fileWritePromise
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    // No file was processed
                    resolve()
                }
            })

            // Handle parsing errors
            bb.on("error", (error: Error) => {
                console.error(`[DEBUG] Busboy error: ${error.message}`)
                reject(error)
            })

            // Process rawBody if available or pipe the request
            if ((req as any).rawBody) {
                console.log("[DEBUG] Using req.rawBody for processing")
                bb.end((req as any).rawBody)
            } else {
                console.log("[DEBUG] Piping request to busboy")
                req.pipe(bb)
            }
        })

        // Process the uploaded file
        if (!fileData) {
            return res.status(400).json({
                success: false,
                message: "No audio file uploaded"
            })
        }

        // At this point, fileData is definitely not null, but TypeScript doesn't know that
        // Use a non-null assertion to tell TypeScript this is safe
        const processedFileData = fileData as FileData

        // Verify file exists - TypeScript now knows fileData is not null
        if (!fs.existsSync(processedFileData.path)) {
            return res.status(500).json({
                success: false,
                message: "Temporary file was not properly saved"
            })
        }

        // Create final file name and path
        const fileExt = path.extname(processedFileData.originalname)
        const fileName = `${Date.now()}${fileExt}`

        // Upload file to Firebase Storage
        console.log("[DEBUG] Uploading file to Firebase Storage")
        const storageUrl = await uploadToFirebaseStorage(processedFileData.path, fileName, processedFileData.mimetype)

        let transcript = ""
        let recommendations = ""

        // Skip AI processing if requested
        if (!skipAI) {
            // Step 1: Transcribe the audio
            console.log("[DEBUG] Starting audio transcription")
            transcript = await transcribeAudio(processedFileData.path)

            // Step 2: Get medical recommendations based on the transcript
            console.log("[DEBUG] Getting medical recommendations")
            recommendations = await getMedicalRecommendations(transcript)
        } else {
            console.log("[DEBUG] Skipping AI processing as requested")
        }

        // Create timestamp using a safe method
        console.log("[DEBUG] Creating timestamp for recording")
        let uploadedAt
        try {
            // Try using FieldValue.serverTimestamp() for better compatibility with emulator
            if (req.query.useEmulator === "true") {
                console.log("[DEBUG] Using manual timestamp for emulator")
                // Create a regular JavaScript Date and then convert it to a Firestore Timestamp
                const now = new Date()
                console.log("[DEBUG] Created JavaScript Date:", now)
                // Check if admin and admin.firestore are defined
                if (admin && admin.firestore && admin.firestore.Timestamp) {
                    uploadedAt = admin.firestore.Timestamp.fromDate(now)
                    console.log("[DEBUG] Successfully created Firestore timestamp from Date")
                } else {
                    console.log("[DEBUG] admin.firestore.Timestamp is not available, using server timestamp")
                    uploadedAt = admin.firestore.FieldValue.serverTimestamp()
                }
            } else {
                uploadedAt = createFirestoreTimestamp()
            }
        } catch (error) {
            console.log("[DEBUG] Error creating timestamp, using manual object fallback", error)
            // As a last resort, create a timestamp-like object manually
            const now = new Date()
            uploadedAt = {
                seconds: Math.floor(now.getTime() / 1000),
                nanoseconds: now.getMilliseconds() * 1000000
            }
            console.log("[DEBUG] Created manual timestamp-like object:", uploadedAt)
        }
        console.log("[DEBUG] Created timestamp:", uploadedAt)

        // Step 3: Save recording info to Firestore
        const recordingData: RecordingDocument = {
            filename: fileName,
            path: `audio/${fileName}`,
            storageUrl: storageUrl,
            size: processedFileData.size || 0,
            uploadedAt,
            transcript,
            recommendations,
            userId: (req as any).user?.uid || null, // If using Firebase Auth
            metadata: {
                originalFilename: processedFileData.originalname,
                mimeType: processedFileData.mimetype
            }
        }

        const recordingId = await saveRecordingToFirestore(recordingData)

        // Clean up temp file
        try {
            fs.unlinkSync(processedFileData.path)
            console.log(`[DEBUG] Deleted temp file: ${processedFileData.path}`)
        } catch (err) {
            console.error(`[DEBUG] Failed to delete temp file: ${processedFileData.path}`, err)
        }

        // Return comprehensive response
        return res.status(200).json({
            success: true,
            message: "Audio processed successfully",
            recordingId,
            file: {
                filename: fileName,
                path: `audio/${fileName}`,
                storageUrl: storageUrl,
                size: processedFileData.size
            },
            transcript,
            recommendations
        })
    } catch (error: any) {
        console.error("[DEBUG] Error processing upload:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to process upload",
            error: error.message
        })
    }
})

// New endpoint to retrieve recordings from Firestore
app.get("/recordings", async (req: express.Request, res: express.Response) => {
    try {
        console.log("[DEBUG] Fetching recordings from Firestore")

        // Optional user ID filter
        const userId = req.query.userId as string | undefined

        // Check for cache busting parameter
        const cacheBuster = req.query.nocache || req.query.verify
        if (cacheBuster) {
            console.log(`[DEBUG] Cache busting parameter detected: ${cacheBuster}`)
        }

        // Create query
        let query = recordingsCollection.orderBy("uploadedAt", "desc")

        // Add user filter if provided
        if (userId) {
            query = query.where("userId", "==", userId)
        }

        // Get recordings
        const snapshot = await query.limit(100).get()

        // Extract recording data
        const recordings = snapshot.docs.map((doc) => ({
            id: doc.id,
            ...doc.data()
        }))

        return res.status(200).json({
            success: true,
            count: recordings.length,
            recordings,
            timestamp: Date.now() // Add server timestamp for cache validation
        })
    } catch (error: any) {
        console.error("[DEBUG] Error fetching recordings:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch recordings",
            error: error.message
        })
    }
})

// Delete all recordings - IMPORTANT: This must come BEFORE the :id route to avoid capture
app.delete("/recordings/all", async (req: express.Request, res: express.Response) => {
    try {
        console.log("[DEBUG] Attempting to delete all recordings")

        // Optional user ID filter
        const userId = req.query.userId as string | undefined

        // Create base query
        let baseQuery = recordingsCollection

        // Get all recordings to delete
        let snapshot

        // Add user filter if provided
        if (userId) {
            snapshot = await baseQuery.where("userId", "==", userId).get()
        } else {
            snapshot = await baseQuery.get()
        }

        if (snapshot.empty) {
            console.log("[DEBUG] No recordings found to delete")
            return res.status(200).json({
                success: true,
                message: "No recordings found to delete",
                count: 0
            })
        }

        // Delete each recording in a batch
        const batch = db.batch()
        snapshot.docs.forEach((doc) => {
            batch.delete(doc.ref)
        })

        // Commit the batch
        await batch.commit()

        console.log(`[DEBUG] Successfully deleted ${snapshot.size} recordings`)

        return res.status(200).json({
            success: true,
            message: `Successfully deleted ${snapshot.size} recordings`,
            count: snapshot.size
        })
    } catch (error: any) {
        console.error("[DEBUG] Error deleting all recordings:", error)
        return res.status(500).json({
            success: false,
            message: "Failed to delete all recordings",
            error: error.message
        })
    }
})

// Delete a specific recording by ID
app.delete("/recordings/:id", async (req: express.Request, res: express.Response) => {
    try {
        const recordingId = req.params.id
        console.log(`[DEBUG] Deleting recording with ID: ${recordingId}`)

        // Get the document reference
        const docRef = recordingsCollection.doc(recordingId)

        // Check if document exists
        const docSnapshot = await docRef.get()

        if (!docSnapshot.exists) {
            console.log(`[DEBUG] Recording ${recordingId} not found for deletion`)
            return res.status(404).json({
                success: false,
                message: "Recording not found"
            })
        }

        // Delete the document
        await docRef.delete()

        console.log(`[DEBUG] Successfully deleted recording: ${recordingId}`)

        return res.status(200).json({
            success: true,
            message: "Recording deleted successfully",
            id: recordingId
        })
    } catch (error: any) {
        console.error(`[DEBUG] Error deleting recording: ${error.message}`)
        return res.status(500).json({
            success: false,
            message: "Failed to delete recording",
            error: error.message
        })
    }
})

// Get a specific recording by ID - Should come after DELETE endpoints with same path pattern
app.get("/recordings/:id", async (req: express.Request, res: express.Response) => {
    try {
        const recordingId = req.params.id
        console.log(`[DEBUG] Fetching recording with ID: ${recordingId}`)

        const docSnapshot = await recordingsCollection.doc(recordingId).get()

        if (!docSnapshot.exists) {
            return res.status(404).json({
                success: false,
                message: "Recording not found"
            })
        }

        return res.status(200).json({
            success: true,
            recording: {
                id: docSnapshot.id,
                ...docSnapshot.data()
            }
        })
    } catch (error: any) {
        console.error(`[DEBUG] Error fetching recording: ${error.message}`)
        return res.status(500).json({
            success: false,
            message: "Failed to fetch recording",
            error: error.message
        })
    }
})

// Endpoint to handle a single chunk of audio
app.post("/upload-audio-chunk", async (req: express.Request, res: express.Response) => {
    console.log("[DEBUG] Received audio chunk upload request")
    console.log("[DEBUG] Query params:", req.query)

    if (!req.headers["content-type"]) {
        return res.status(400).json({
            success: false,
            message: "Missing Content-Type header"
        })
    }

    console.log(`[DEBUG] Content-Type: ${req.headers["content-type"]}`)

    try {
        // Store file details and chunk metadata
        let fileData: FileData | null = null
        let sessionId = ""
        let chunkNumber = 0
        let totalChunks = 0
        let originalFilename = ""
        let mimeType = ""

        // Use busboy for multipart form parsing
        const bb = Busboy({
            headers: req.headers,
            limits: {
                fileSize: 50 * 1024 * 1024 // 50MB per chunk
            }
        })

        // Create a new promise for file upload and field parsing
        await new Promise<void>((resolve, reject) => {
            let fileWritePromise: Promise<void> | null = null

            // Handle file upload
            bb.on("file", (fieldname: string, fileStream: NodeJS.ReadableStream, info: any) => {
                console.log(`[DEBUG] Processing chunk file: ${info.filename}`)

                if (fieldname !== "audioChunk") {
                    console.log(`[DEBUG] Skipping non-chunk field: ${fieldname}`)
                    fileStream.resume() // Skip this file
                    return
                }

                // Create session directory if needed
                const sessionDir = path.join(chunksDir, sessionId)

                // Create unique chunk file name
                const chunkFileName = `chunk_${sessionId}_${chunkNumber}.part`
                const chunkFilePath = path.join(sessionDir, chunkFileName)

                // Ensure session directory exists
                if (!fs.existsSync(sessionDir)) {
                    fs.mkdirSync(sessionDir, { recursive: true })
                    console.log(`[DEBUG] Created session directory: ${sessionDir}`)
                }

                // Create file data for tracking
                fileData = {
                    fieldname,
                    originalname: originalFilename,
                    encoding: info.encoding,
                    mimetype: mimeType,
                    path: chunkFilePath
                }

                console.log(`[DEBUG] Saving chunk to: ${chunkFilePath}`)
                const writeStream = fs.createWriteStream(chunkFilePath)

                // Track file write completion
                fileWritePromise = new Promise<void>((resolveFile, rejectFile) => {
                    writeStream.on("finish", () => {
                        console.log(`[DEBUG] Chunk write completed: ${chunkFilePath}`)
                        try {
                            const stats = fs.statSync(chunkFilePath)
                            if (fileData) {
                                fileData.size = stats.size
                                console.log(`[DEBUG] Chunk size: ${stats.size} bytes`)
                            }
                            resolveFile()
                        } catch (error) {
                            console.error(`[DEBUG] Error checking chunk stats: ${error}`)
                            rejectFile(error)
                        }
                    })

                    writeStream.on("error", (error) => {
                        console.error(`[DEBUG] Error writing chunk: ${error}`)
                        rejectFile(error)
                    })
                })

                // Save the data to disk
                fileStream.pipe(writeStream)
            })

            // Handle form fields
            bb.on("field", (fieldname: string, value: string) => {
                console.log(`[DEBUG] Field [${fieldname}]: ${value}`)

                // Process metadata fields
                switch (fieldname) {
                    case "sessionId":
                        sessionId = value
                        break
                    case "chunkNumber":
                        chunkNumber = parseInt(value, 10)
                        break
                    case "totalChunks":
                        totalChunks = parseInt(value, 10)
                        break
                    case "filename":
                        originalFilename = value
                        break
                    case "mimeType":
                        mimeType = value
                        break
                }
            })

            // Handle parsing completion
            bb.on("close", async () => {
                console.log("[DEBUG] Busboy close event fired for chunk upload")

                // Validate metadata
                if (!sessionId) {
                    reject(new Error("Missing sessionId parameter"))
                    return
                }

                if (chunkNumber < 1) {
                    reject(new Error("Invalid chunkNumber parameter"))
                    return
                }

                if (totalChunks < 1) {
                    reject(new Error("Invalid totalChunks parameter"))
                    return
                }

                // Make sure file was written completely before resolving
                if (fileWritePromise) {
                    try {
                        await fileWritePromise
                        resolve()
                    } catch (error) {
                        reject(error)
                    }
                } else {
                    // No file was processed
                    console.log("[DEBUG] No chunk file was processed")
                    reject(new Error("No chunk file was processed"))
                }
            })

            // Handle parsing errors
            bb.on("error", (error: Error) => {
                console.error(`[DEBUG] Busboy error for chunk: ${error.message}`)
                reject(error)
            })

            // Process rawBody if available or pipe the request
            if ((req as any).rawBody) {
                console.log("[DEBUG] Using req.rawBody for chunk processing")
                bb.end((req as any).rawBody)
            } else {
                console.log("[DEBUG] Piping chunk request to busboy")
                req.pipe(bb)
            }
        })

        // Now the metadata and file should be processed
        if (!fileData) {
            return res.status(400).json({
                success: false,
                message: "No chunk file was uploaded"
            })
        }

        const processedFileData: FileData = fileData

        // Ensure all metadata is available
        if (!sessionId || !chunkNumber || !totalChunks || !originalFilename || !mimeType) {
            return res.status(400).json({
                success: false,
                message: "Missing required metadata",
                details: {
                    sessionId: !!sessionId,
                    chunkNumber: !!chunkNumber,
                    totalChunks: !!totalChunks,
                    filename: !!originalFilename,
                    mimeType: !!mimeType
                }
            })
        }

        // Get or create chunk session
        if (!chunkSessions.has(sessionId) && chunkNumber === 1) {
            // Create new session for the first chunk
            chunkSessions.set(sessionId, {
                sessionId,
                chunks: new Map(),
                totalChunks,
                originalFilename,
                mimeType,
                createdAt: Date.now()
            })
            console.log(`[DEBUG] Created new chunk session: ${sessionId}`)
        } else if (!chunkSessions.has(sessionId)) {
            // If it's not the first chunk but session doesn't exist
            return res.status(400).json({
                success: false,
                message: "Session not found. Upload the first chunk first."
            })
        }

        // Get the session
        const session = chunkSessions.get(sessionId)!

        // Validate chunk number is in range
        if (chunkNumber > session.totalChunks) {
            return res.status(400).json({
                success: false,
                message: `Invalid chunk number. Expected: 1-${session.totalChunks}, Received: ${chunkNumber}`
            })
        }

        // Store chunk info in session
        session.chunks.set(chunkNumber, {
            path: processedFileData.path,
            size: processedFileData.size || 0,
            chunkNumber
        })

        console.log(`[DEBUG] Added chunk ${chunkNumber}/${totalChunks} to session ${sessionId}`)

        // Return success for this chunk
        return res.status(200).json({
            success: true,
            message: `Successfully received chunk ${chunkNumber} of ${totalChunks}`,
            sessionId,
            chunkNumber,
            totalChunks,
            remainingChunks: totalChunks - session.chunks.size
        })
    } catch (error: any) {
        console.error(`[DEBUG] Error processing chunk: ${error.message}`)
        return res.status(500).json({
            success: false,
            message: `Failed to process audio chunk: ${error.message}`
        })
    }
})

// Endpoint to finalize a chunked upload
app.post("/finalize-chunked-upload", async (req: express.Request, res: express.Response) => {
    console.log("[DEBUG] Received finalize-chunked-upload request")

    // Get session ID from the body
    const { sessionId } = req.body

    if (!sessionId) {
        return res.status(400).json({
            success: false,
            message: "Missing sessionId parameter"
        })
    }

    // Check if session exists
    if (!chunkSessions.has(sessionId)) {
        return res.status(400).json({
            success: false,
            message: "Session not found"
        })
    }

    // Get the session
    const session = chunkSessions.get(sessionId)!

    // Check if all chunks were uploaded
    if (session.chunks.size !== session.totalChunks) {
        return res.status(400).json({
            success: false,
            message: `Cannot finalize. Missing chunks. Received: ${session.chunks.size}/${session.totalChunks}`,
            receivedChunks: Array.from(session.chunks.keys()).sort((a, b) => a - b)
        })
    }

    try {
        console.log(`[DEBUG] Finalizing session ${sessionId} with ${session.totalChunks} chunks`)

        // Create a final file name with the original extension
        const fileExt = path.extname(session.originalFilename)
        const finalFileName = `${Date.now()}${fileExt}`
        const sessionDir = path.join(chunksDir, sessionId)
        const tmpMergedFilePath = path.join(os.tmpdir(), finalFileName)

        // Merge chunks
        console.log(`[DEBUG] Merging chunks to: ${tmpMergedFilePath}`)
        const mergedFileWriteStream = fs.createWriteStream(tmpMergedFilePath)

        // Process chunks in sequence
        let recordingId = ""
        let storageUrl = ""

        // Function to process next chunk
        const processNextChunk = (index: number) => {
            if (index > session.totalChunks) {
                // All chunks processed, finalize
                console.log("[DEBUG] All chunks processed, closing write stream")
                mergedFileWriteStream.end()
                return
            }

            // Get chunk info
            const chunkInfo = session.chunks.get(index)
            if (!chunkInfo) {
                console.error(`[DEBUG] Error: Chunk ${index} not found`)
                mergedFileWriteStream.destroy(new Error(`Chunk ${index} not found`))
                return
            }

            // Read chunk and pipe to final file
            console.log(`[DEBUG] Appending chunk ${index} from ${chunkInfo.path}`)
            const chunkReadStream = fs.createReadStream(chunkInfo.path)

            // Handle errors during reading
            chunkReadStream.on("error", (error) => {
                console.error(`[DEBUG] Error reading chunk ${index}: ${error}`)
                mergedFileWriteStream.destroy(error)
            })

            // Handle when chunk is fully read
            chunkReadStream.on("end", () => {
                console.log(`[DEBUG] Finished appending chunk ${index}`)
                // Process next chunk
                processNextChunk(index + 1)
            })

            // Pipe chunk to merged file
            chunkReadStream.pipe(mergedFileWriteStream, { end: false })
        }

        // Wait for the file to be merged
        await new Promise<void>((resolve, reject) => {
            // Handle successful completion
            mergedFileWriteStream.on("finish", async () => {
                console.log("[DEBUG] Successfully merged all chunks")

                try {
                    // Get file size
                    const stats = fs.statSync(tmpMergedFilePath)
                    console.log(`[DEBUG] Merged file size: ${stats.size} bytes`)

                    // Upload to Firebase Storage
                    console.log("[DEBUG] Uploading merged file to Firebase Storage")
                    storageUrl = await uploadToFirebaseStorage(tmpMergedFilePath, finalFileName, session.mimeType)

                    // Create Firestore record
                    const recordingData: RecordingDocument = {
                        filename: finalFileName,
                        path: `audio/${finalFileName}`,
                        storageUrl: storageUrl,
                        size: stats.size,
                        uploadedAt: createFirestoreTimestamp(),
                        userId: (req as any).user?.uid || null,
                        metadata: {
                            originalFilename: session.originalFilename,
                            mimeType: session.mimeType,
                            fromChunks: true,
                            chunks: session.totalChunks
                        }
                    }

                    // Save to Firestore
                    recordingId = await saveRecordingToFirestore(recordingData)
                    console.log(`[DEBUG] Saved recording to Firestore with ID: ${recordingId}`)

                    resolve()
                } catch (error) {
                    console.error("[DEBUG] Error finalizing chunks:", error)
                    reject(error)
                }
            })

            // Handle errors during write
            mergedFileWriteStream.on("error", (error) => {
                console.error(`[DEBUG] Error merging chunks: ${error}`)
                reject(error)
            })

            // Start processing from first chunk
            processNextChunk(1)
        })

        // Clean up chunk files
        console.log(`[DEBUG] Cleaning up chunk files for session ${sessionId}`)
        try {
            session.chunks.forEach((chunkInfo) => {
                try {
                    fs.unlinkSync(chunkInfo.path)
                    console.log(`[DEBUG] Deleted chunk: ${chunkInfo.path}`)
                } catch (error) {
                    console.error(`[DEBUG] Error deleting chunk: ${error}`)
                }
            })

            // Try to remove session directory
            try {
                if (fs.existsSync(sessionDir)) {
                    fs.rmdirSync(sessionDir)
                    console.log(`[DEBUG] Removed session directory: ${sessionDir}`)
                }
            } catch (rmError) {
                console.error(`[DEBUG] Error removing session directory: ${rmError}`)
            }

            // Remove from sessions map
            chunkSessions.delete(sessionId)
            console.log(`[DEBUG] Removed session: ${sessionId}`)

            // Clean up the temporary merged file
            try {
                fs.unlinkSync(tmpMergedFilePath)
                console.log(`[DEBUG] Deleted temporary merged file: ${tmpMergedFilePath}`)
            } catch (rmError) {
                console.error(`[DEBUG] Error removing temporary merged file: ${rmError}`)
            }
        } catch (cleanupError) {
            console.error(`[DEBUG] Error during cleanup: ${cleanupError}`)
        }

        // Return success with recording details
        return res.status(200).json({
            success: true,
            message: "Successfully finalized chunked upload",
            recordingId,
            file: {
                filename: finalFileName,
                path: `audio/${finalFileName}`,
                storageUrl: storageUrl
            }
        })
    } catch (error: any) {
        console.error(`[DEBUG] Error finalizing chunks: ${error.message}`)
        return res.status(500).json({
            success: false,
            message: `Failed to finalize chunked upload: ${error.message}`
        })
    }
})

// Error handling middleware
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("[DEBUG] Error:", err)
    res.status(500).json({
        success: false,
        message: err.message || "Something went wrong"
    })
})

// Export the Express app as a Firebase Cloud Function with options to handle larger payloads
export const api = functions
    .runWith({
        // Increase memory and timeout for file processing
        memory: "1GB",
        timeoutSeconds: 300
    })
    .https.onRequest(app)
