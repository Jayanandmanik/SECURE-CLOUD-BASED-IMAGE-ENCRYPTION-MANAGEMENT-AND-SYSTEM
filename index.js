const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const multer = require('multer');
const fs = require('fs');
const app = express();
const cors = require('cors');
require('dotenv').config();

// Middleware for file uploads
const upload = multer({ dest: 'uploads/' });

// Create the uploads directory if it doesn't exist
if (!fs.existsSync('uploads')) {
    fs.mkdirSync('uploads');
} 

// MongoDB Connection
mongoose.connect('mongodb://127.0.0.1:27017/Authentication')
    .then(() => console.log("Connection Successful"))
    .catch((err) => console.log("Connection failed!", err));

// User Schema
const loginschema = new mongoose.Schema({
    FullName: String,
    Email: String,
    PhoneNumber: String,
    Username: String,
    Password: String,
});
const loginmodel = new mongoose.model('csedata3', loginschema, 'LoginDetails');

// Encrypted Data Schema
const encryptedDataSchema = new mongoose.Schema({
    encryptedImage: String, // Base64 string
    key: String, // Encryption key (hexadecimal)
    iv: String, // Initialization vector (hexadecimal)
    fileName: String, // File name
    createdAt: { type: Date, default: Date.now }
});

const EncryptedDataModel = mongoose.model('EncryptedData', encryptedDataSchema);

// Serve Static Files
if (!fs.existsSync('public')) {
    console.error("The 'public' directory is missing. Please create it and add the required HTML files.");
    process.exit(1);
}

app.use(cors());
app.use(express.static('public'));
app.use(express.json({ limit: '50mb' })); // Increase the payload size limit to 50MB
app.use(express.urlencoded({ extended: true, limit: '50mb' })); // Increase the payload size limit to 50MB

// AWS S3 Configuration
const s3Client = new S3Client({
    region: process.env.AWS_REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

// Start Server
app.listen(3005, () => {
    console.log("Server is running at 3005...!");
});

// Routes
app.get('/home', (req, res) => {
    res.sendFile(__dirname + '/public/main.html');
});

app.get('/login', (req, res) => {
    res.sendFile(__dirname + '/public/login.html');
});

app.get('/index', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/forgotpassword', (req, res) => {
    res.sendFile(__dirname + '/public/forgotpassword.html');
});

app.get('/encrypt-decrypt', (req, res) => {
    res.sendFile(__dirname + '/public/encryption.html');
});

app.get('/encrypt-data', (req, res) => {
    res.sendFile(__dirname + '/public/h.html');
});

// Login Route
app.post('/login', async (req, res) => {
    const { fullName, email, phoneNumber, user, pass, confirmPassword } = req.body;

    // Check if passwords match
    if (pass !== confirmPassword) {
        return res.status(400).send("Passwords do not match.");
    }

    // Check if the user already exists
    const existingUser = await loginmodel.findOne({ Username: user });
    if (existingUser) {
        return res.status(400).send("User already exists.");
    }

    // Hash the password
    const hashedpassword = await bcrypt.hash(pass, 10);

    // Create a new user with additional fields
    const newuser = new loginmodel({
        FullName: fullName,
        Email: email,
        PhoneNumber: phoneNumber,
        Username: user,
        Password: hashedpassword,
    });

    // Save the user to the database
    await newuser.save().then(() => {
        res.sendFile(__dirname + '/public/index.html');
    });
});

// Index Route
app.post('/index', async (req, res) => {
    try {
        const user = await loginmodel.findOne({ Username: req.body.luser });
        if (user) {
            const passwordmatch = await bcrypt.compare(req.body.lpass, user.Password);
            if (passwordmatch) {
                res.sendFile(__dirname + '/public/home.html');
            } else {
                res.sendFile(__dirname + '/public/index.html');
            }
        } else {
            res.sendFile(__dirname + '/public/index.html');
        }
    } catch (error) {
        console.error("Error in /index route:", error);
        res.status(500).send("An error occurred while processing your request.");
    }
});

// Forgot Password Route
app.post('/forgotpassword', async (req, res) => {
    const { username, newPassword, confirmPassword } = req.body;

    if (newPassword !== confirmPassword) {
        return res.status(400).send("Passwords do not match.");
    }

    try {
        const user = await loginmodel.findOne({ Username: username });

        if (!user) {
            return res.status(404).send("User not found.");
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        user.Password = hashedPassword;
        await user.save();

        res.status(200).send("Password updated successfully.");
    } catch (error) {7065
        console.error("Error updating password:", error);
        res.status(500).send("An error occurred while updating the password.");
    }
});

// Route to handle encrypted data
app.post('/encrypt-image', async (req, res) => {
    try {
        const { encryptedImage, key, iv, fileName } = req.body;

        if (!encryptedImage || !key || !iv || !fileName) {
            return res.status(400).send("Missing required fields.");
        }

        // Save encrypted data to MongoDB
        const encryptedData = new EncryptedDataModel({
            encryptedImage: encryptedImage,
            key: key,
            iv: iv,
            fileName: fileName,
        });

        await encryptedData.save();

        // Upload encrypted image to S3
        const base64Data = Buffer.from(encryptedImage, 'base64');
        const params = {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: `encrypted-images/${fileName}`, // Store in a folder named 'encrypted-images'
            Body: base64Data,
            ContentType: 'application/octet-stream', // Adjust content type as needed
        };

        await s3Client.send(new PutObjectCommand(params));

        res.status(200).json({
            message: "Encrypted data saved to database and uploaded to S3.",
            id: encryptedData._id, // Return the MongoDB ID for reference
        });
    } catch (error) {
        console.error("Error saving encrypted data or uploading to S3:", error);
        res.status(500).send("An error occurred while saving encrypted data or uploading to S3.");
    }
});

// Image Decryption Route
app.post('/decrypt-image', upload.single('encryptedImage'), async (req, res) => {
    try {
        const { encryptedDataId } = req.body; // Assume the client sends the ID of the encrypted data

        // Fetch the encrypted data from MongoDB
        const encryptedData = await EncryptedDataModel.findById(encryptedDataId);

        if (!encryptedData) {
            return res.status(404).send("Encrypted data not found.");
        }

        // Convert base64 encrypted image back to a buffer
        const encryptedImageBuffer = Buffer.from(encryptedData.encryptedImage, 'base64');

        // AES-256 Decryption
        const algorithm = 'aes-256-cbc';
        const decipher = crypto.createDecipheriv(algorithm, Buffer.from(encryptedData.key, 'hex'), Buffer.from(encryptedData.iv, 'hex'));
        let decrypted = decipher.update(encryptedImageBuffer);
        decrypted = Buffer.concat([decrypted, decipher.final()]);

        // Save decrypted image locally
        const decryptedFilePath = `decrypted/decrypted_${encryptedData.fileName}`;
        fs.writeFileSync(decryptedFilePath, decrypted);

        // Send the decrypted image as a file response
        res.status(200).sendFile(decryptedFilePath, { root: __dirname });
    } catch (error) {
        console.error("Error decrypting image:", error);
        res.status(500).send("An error occurred while decrypting the image.");
    }
});