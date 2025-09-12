// // D:\newapp\fullbackend-main\fullbackend-main_\server.js
// const mongoose = require("mongoose");
// const dotenv = require("dotenv");
// const app = require("./app");
// const http = require("http");
// const socket = require("./socket");

// dotenv.config();

// mongoose.connect(process.env.MONGODB_URI, {
//   useNewUrlParser: true,
//   useUnifiedTopology: true,
//   serverSelectionTimeoutMS: 10000, // 10 sec timeout
// })
// .then(() => console.log("✅ MongoDB connected"))
// .catch((err) => {
//   console.error("❌ DB connection error:", err.message);
// });


// const server = http.createServer(app);

// // init socket.io
// socket.init(server);

// // Make sure the port is 5001
// const PORT = process.env.PORT || 5001;

// server.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
//   console.log(`📁 Uploads available at http://localhost:${PORT}/uploads/`);
// });



// D:\newapp\fullbackend-main\fullbackend-main_\server.js
const mongoose = require("mongoose");
const dotenv = require("dotenv");
const app = require("./app");
const http = require("http");
const socket = require("./socket");

dotenv.config();

mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 10000,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("❌ DB connection error:", err.message);
  });

const server = http.createServer(app);

// Initialize socket.io
socket.init(server);

// Set io instance in app for controllers to access
app.set('io', socket.getIO());

const PORT = process.env.PORT || 5001;

server.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Uploads available at http://localhost:${PORT}/uploads/`);
});








// // D:\newapp\fullbackend-main\fullbackend-main_\server.js
// const mongoose = require("mongoose");
// const dotenv = require("dotenv");
// const app = require("./app");
// const http = require("http");
// const socket = require("./socket");

// dotenv.config();

// mongoose
//   .connect(process.env.MONGODB_URI, {})
//   .then(() => console.log("✅ MongoDB connected"))
//   .catch((err) => {
//     console.error("DB error:", err);
//     process.exit(1);
//   });

// const server = http.createServer(app);

// // init socket.io
// socket.init(server);

// // Make sure the port is 5001
// const PORT = process.env.PORT || 5001;

// server.listen(PORT, () => {
//   console.log(`🚀 Server running on http://localhost:${PORT}`);
// });
