const express = require("express");
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { readdirSync } = require("fs");
const cors = require("cors");
const cookieParser = require("cookie-parser");
const {Server} = require("socket.io");

require("dotenv").config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || "", // important for client to connect
    methods: ["GET", "POST"],
    credentials: true,
  },
});

// WebSocket logic
io.on("connection", (socket) => {
   console.log("A user connected");

  socket.on("join", (userId) => {
    // console.log(`User ${userId} joined`);
    socket.join(userId); // use join/rooms for targeting
  });

  socket.on("disconnect", () => {
    console.log("User disconnected");
  });
});

module.exports = { app, server, io };

const PORT = process.env.PORT || 8000;
const MONGODB_URI = process.env.MONGODB_URI || "";
const NODE_ENV = process.env.NODE_ENV || "development";


// Parse URL-encoded form data
app.use(express.urlencoded({ extended: false }));
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true, limit: "50mb" })); // Increase URL-encoded payload size limit
app.use(cookieParser());

// CORS configuration
app.use(
  cors({
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE",
    credentials: true,
  })
);

// Connect to MongoDB
mongoose.connect(MONGODB_URI);

mongoose.connection.on("connected", () => {
  console.log("Database is connected");
});

mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err);
});

// Default route
app.get("/", (req, res) => {
  res.send("Welcome to the new server!!! :D :D :D :p :p");
});
// Routes
readdirSync("./routes").map((r) => app.use("/", require("./routes/" + r)));

server.listen(PORT, () => {
  console.log(`Server started in ${NODE_ENV} mode at port: ${PORT}`);
});

module.exports = app;