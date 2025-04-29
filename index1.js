const express = require('express');
const crypto = require('crypto');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const app = express();

// Configure multer for file uploads
const upload = multer({ dest: 'uploads/' });

// Serve static files from the "public" folder
app.use(express.static('public'));

// In-memory storage for shared data (replace with a database in production)
const sharedData = {};

// Route to serve the share page
app.get('/share', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'share.html'));
});

// Route to upload encrypted image and generate a unique link
app.post('/share-encrypted-data', upload.single('encryptedImage'), (req, res) => {
    const { key, iv } = req.body;
    const encryptedImage = req.file;

    // Generate a unique ID for the shared data
    const uniqueId = crypto.randomBytes(16).toString('hex');

    // Rename the file to include the unique ID for better security
    const newFilePath = path.join(__dirname, 'uploads', `${uniqueId}_${encryptedImage.originalname}`);
    fs.renameSync(encryptedImage.path, newFilePath);
e
    // Store the key, IV, and file path in memory
    sharedData[uniqueId] = { key, iv, filePath: newFilePath };

    // Set expiration time (e.g., 24 hours)
    setTimeout(() => {
        delete sharedData[uniqueId];
        fs.unlinkSync(newFilePath); // Delete the file after expiration
    }, 24 * 60 * 60 * 1000);

    // Generate a unique link
    const shareLink = `http://localhost:3009/download-encrypted-data/${uniqueId}`;

    res.status(200).json({ shareLink });
});

// Route to serve the download page
app.get('/download-encrypted-data/:id', (req, res) => {
    const { id } = req.params;

    // Retrieve the shared data
    const data = sharedData[id];
    if (!data) {
        return res.status(404).send("Link expired or invalid.");
    }

    // Serve the download page with key, IV, and download link
    res.send(`
        <!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Download Encrypted Data</title>
            <style>
                /* Global Styles */
                body {
                    font-family: 'Poppins', sans-serif;
                    background: linear-gradient(135deg, #1a1a1a, #2c3e50);
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                    color: #fff;
                    overflow: hidden;
                }

                /* Container Styles */
                .container {
                    background: rgba(0, 0, 0, 0.7);
                    padding: 30px;
                    border-radius: 20px;
                    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4);
                    backdrop-filter: blur(15px);
                    width: 700px;
                    text-align: center;
                    animation: fadeIn 1s ease-in-out;
                }

                @keyframes fadeIn {
                    from {
                        opacity: 0;
                        transform: translateY(-20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                /* Heading Styles */
                h1 {
                    font-size: 28px;
                    margin-bottom: 20px;
                    color: #00ff88;
                    text-shadow: 0 0 10px #00ff88, 0 0 20px #00ff88;
                    animation: glow 2s infinite alternate;
                }

                @keyframes glow {
                    from {
                        text-shadow: 0 0 10px #00ff88, 0 0 20px #00ff88;
                    }
                    to {
                        text-shadow: 0 0 20px #00ff88, 0 0 30px #00ff88;
                    }
                }

                /* Key and IV Styles */
                p {
                    font-size: 16px;
                    margin: 10px 0;
                    color: #fff;
                }

                /* Download Button Styles */
                a {
                    display: inline-block;
                    margin-top: 20px;
                    padding: 12px 24px;
                    background: linear-gradient(135deg, #00ff88, #00cc66);
                    color: #1a1a1a;
                    text-decoration: none;
                    border-radius: 10px;
                    font-weight: bold;
                    transition: all 0.3s ease;
                }

                a:hover {
                    background: linear-gradient(135deg, #00cc66, #00ff88);
                    transform: scale(1.05);
                    box-shadow: 0 0 15px #00ff88;
                }

                /* Background Animation */
                body::before {
                    content: '';
                    position: absolute;
                    top: -50%;
                    left: -50%;
                    width: 200%;
                    height: 200%;
                    background: radial-gradient(circle, rgba(0, 255, 136, 0.1), transparent);
                    animation: rotateBackground 20s linear infinite;
                    z-index: -1;
                }

                @keyframes rotateBackground {
                    from {
                        transform: rotate(0deg);
                    }
                    to {
                        transform: rotate(360deg);
                    }
                }
            </style>
        </head>
        <body>
            <div class="container">
                <h1>Download Encrypted Data</h1>
                <p>Key: ${data.key}</p>
                <p>IV: ${data.iv}</p>
                <a href="/uploads/${path.basename(data.filePath)}" download>Download Encrypted Image</a>
            </div>
        </body>
        </html>
    `);
});

// Serve uploaded files
app.use('/uploads', express.static('uploads'));

// Start the server
app.listen(3009, () => {
    console.log("Server is running at 3009...!");
});