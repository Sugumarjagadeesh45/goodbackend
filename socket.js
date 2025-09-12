










// socket.js - Updated with database storage
const { Server } = require("socket.io");
const DriverLocation = require("./models/DriverLocation");
let io;
const rides = {};
const activeDriverSockets = new Map();

const init = (server) => {
  io = new Server(server, {
    cors: { 
      origin: "*", 
      methods: ["GET", "POST"] 
    },
  });

  io.on("connection", (socket) => {
    console.log("⚡ New client connected:", socket.id);

    // -------------------- DRIVER REGISTRATION --------------------
    socket.on("registerDriver", async ({ driverId, latitude, longitude, vehicleType = "taxi", name }) => {
      try {
        socket.driverId = driverId;
        
        // Store driver connection info
        activeDriverSockets.set(driverId, {
          socketId: socket.id,
          driverId,
          location: { latitude, longitude },
          vehicleType,
          name: name || `Driver ${driverId}`,
          lastUpdate: Date.now(),
          status: "Live"
        });
        
        console.log(`✅ Driver registered: ${driverId} at lat: ${latitude}, lng: ${longitude}`);
        
        // Save initial location to database
        await saveDriverLocationToDB(driverId, latitude, longitude, vehicleType);
        
        // Broadcast updated driver list to all users
        broadcastDriverLocations();
        
      } catch (error) {
        console.error("❌ Error registering driver:", error);
      }
    });




    socket.on("requestNearbyDrivers", async ({ latitude, longitude, radius = 5000 }) => {
  try {
    // 查询状态为"Live"的司机，按时间戳排序获取最新位置
    const latestDrivers = await DriverLocation.aggregate([
      { $match: { status: "Live" } },
      { $sort: { timestamp: -1 } },
      { $group: {
          _id: "$driverId",
          driverId: { $first: "$driverId" },
          latitude: { $first: "$latitude" },
          longitude: { $first: "$longitude" },
          vehicleType: { $first: "$vehicleType" },
          status: { $first: "$status" },
          timestamp: { $first: "$timestamp" }
        }
      }
    ]);

    // 计算每个司机的距离并过滤在半径内的司机
    const nearbyDrivers = [];
    for (const driver of latestDrivers) {
      const distance = calculateDistance(
        latitude,
        longitude,
        driver.latitude,
        driver.longitude
      );
      if (distance <= radius) {
        nearbyDrivers.push({
          driverId: driver.driverId,
          name: driver.driverId,
          location: {
            coordinates: [driver.longitude, driver.latitude]
          },
          vehicleType: driver.vehicleType,
          status: driver.status,
          distance: distance
        });
      }
    }

    // 按距离排序
    nearbyDrivers.sort((a, b) => a.distance - b.distance);

    // 返回给请求的用户
    socket.emit("nearbyDriversResponse", { drivers: nearbyDrivers });
  } catch (error) {
    console.error("❌ Error fetching nearby drivers:", error);
    socket.emit("nearbyDriversResponse", { drivers: [] });
  }
});



    // -------------------- DRIVER LIVE LOCATION UPDATE --------------------
    socket.on("driverLocationUpdate", async ({ driverId, latitude, longitude }) => {
      try {
        if (activeDriverSockets.has(driverId)) {
          const driverData = activeDriverSockets.get(driverId);
          driverData.location = { latitude, longitude };
          driverData.lastUpdate = Date.now();
          activeDriverSockets.set(driverId, driverData);
          
          console.log(`📍 Driver ${driverId} location: lat=${latitude}, lng=${longitude}`);
          
          // Save to database immediately
          await saveDriverLocationToDB(driverId, latitude, longitude, driverData.vehicleType);
          
          // Broadcast to all users
          broadcastDriverLocations();
        }
      } catch (error) {
        console.error("❌ Error updating driver location:", error);
      }
    });

    // -------------------- DISCONNECT --------------------
    socket.on("disconnect", () => {
      console.log("❌ Client disconnected:", socket.id);
      if (socket.driverId) {
        console.log(`🛑 Driver ${socket.driverId} disconnected`);
        
        // Save final location with offline status
        if (activeDriverSockets.has(socket.driverId)) {
          const driverData = activeDriverSockets.get(socket.driverId);
          saveDriverLocationToDB(
            socket.driverId, 
            driverData.location.latitude, 
            driverData.location.longitude, 
            driverData.vehicleType,
            "Offline"
          ).catch(console.error);
        }
        
        activeDriverSockets.delete(socket.driverId);
        broadcastDriverLocations();
      }
    });
    
    // ... rest of your socket events ...
  });

  // Clean up inactive drivers every 30 seconds
  setInterval(() => {
    const now = Date.now();
    const thirtySecondsAgo = now - 30000;
    
    Array.from(activeDriverSockets.entries()).forEach(([driverId, driver]) => {
      if (driver.lastUpdate < thirtySecondsAgo) {
        // Save as offline
        saveDriverLocationToDB(
          driverId, 
          driver.location.latitude, 
          driver.location.longitude, 
          driver.vehicleType,
          "Offline"
        ).catch(console.error);
        
        activeDriverSockets.delete(driverId);
        console.log(`🧹 Removed inactive driver: ${driverId}`);
      }
    });
    
    broadcastDriverLocations();
  }, 30000);
};

// Helper function to save driver location to database
async function saveDriverLocationToDB(driverId, latitude, longitude, vehicleType, status = "Live") {
  try {
    const locationDoc = new DriverLocation({
      driverId,
      latitude,
      longitude,
      vehicleType,
      status,
      timestamp: new Date()
    });
    
    await locationDoc.save();
    console.log(`💾 Saved location for driver ${driverId} to database`);
    return true;
  } catch (error) {
    console.error("❌ Error saving driver location to DB:", error);
    return false;
  }
}

// Helper function to broadcast driver locations to all users
function broadcastDriverLocations() {
  const drivers = Array.from(activeDriverSockets.values()).map(driver => ({
    driverId: driver.driverId,
    name: driver.name,
    location: {
      coordinates: [driver.location.longitude, driver.location.latitude]
    },
    vehicleType: driver.vehicleType,
    status: driver.status,
    lastUpdate: driver.lastUpdate
  }));
  
  io.emit("driverLocationsUpdate", drivers);
}

// Helper function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = lat1 * Math.PI/180;
  const φ2 = lat2 * Math.PI/180;
  const Δφ = (lat2-lat1) * Math.PI/180;
  const Δλ = (lon2-lon1) * Math.PI/180;
  const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ/2) * Math.sin(Δλ/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c; // Distance in meters
}

// -------------------- GET IO INSTANCE --------------------
const getIO = () => {
  if (!io) throw new Error("❌ Socket.io not initialized!");
  return io;
};

module.exports = { init, getIO };



































































// // backend/socket.js
// const { Server } = require("socket.io");

// let io;
// const rides = {}; // In-memory storage for rides (rideId -> ride info)

// const init = (server) => {
//   io = new Server(server, {
//     cors: { origin: "*", methods: ["GET", "POST"] },
//   });

//   io.on("connection", (socket) => {
//     console.log("⚡ New client connected:", socket.id);

//     // -------------------- DRIVER REGISTRATION --------------------
//     socket.on("registerDriver", (driverId) => {
//       socket.driverId = driverId;
//       console.log(`✅ Driver registered: ${driverId}`);
//     });

//     // -------------------- USER BOOKS RIDE --------------------
//     socket.on("bookRide", (rideData) => {
//       console.log("📲 Ride booked:", rideData);

//       // Save ride in memory
//       rides[rideData.rideId] = {
//         ...rideData,
//         userSocketId: socket.id,
//         status: "searching",
//         otp: null,
//         driverId: null,
//       };

//       // User joins ride room
//       socket.join(rideData.rideId);

//       // Notify all drivers about the new ride
//       io.emit("rideRequest", rideData);
//     });

//     // -------------------- DRIVER ACCEPTS RIDE --------------------
//     socket.on("acceptRide", ({ rideId, driverId }) => {
//       const ride = rides[rideId];
//       if (!ride) return;

//       // Driver joins ride room
//       socket.join(rideId);

//       ride.driverId = driverId;
//       ride.status = "onTheWay"; // updated status
//       console.log(`✅ Ride ${rideId} accepted by driver ${driverId}`);

//       // Notify ONLY the user who booked
//       io.to(ride.userSocketId).emit("rideAccepted", { rideId, driverId });

//       // 🔹 Generate OTP for user verification
//       const otp = Math.floor(1000 + Math.random() * 9000).toString();
//       ride.otp = otp;
//       console.log(`🔑 OTP for ride ${rideId}: ${otp}`);

//       io.to(ride.userSocketId).emit("rideOTP", { rideId, otp });
//     });

//     // -------------------- DRIVER VERIFIES OTP --------------------
//     socket.on("verifyRideOTP", ({ rideId, enteredOtp, driverId }) => {
//       const ride = rides[rideId];
//       if (!ride) return;

//       if (ride.otp === enteredOtp) {
//         ride.status = "started";
//         console.log(`🚦 Ride ${rideId} started by driver ${driverId}`);

//         // Notify user and driver
//         io.to(ride.userSocketId).emit("rideStarted", { rideId, driverId });
//         socket.emit("rideStarted", { rideId });
//       } else {
//         console.log(`❌ OTP mismatch for ride ${rideId}`);
//         socket.emit("otpFailed", { rideId });
//       }
//     });

//     // -------------------- DRIVER LOCATION UPDATES --------------------
//     socket.on("driverLocationUpdate", ({ rideId, driverId, lat, lng }) => {
//       const ride = rides[rideId];
//       if (!ride) return;

//       console.log(`📍 Driver ${driverId} location update: lat=${lat}, lng=${lng}`);

//       // Broadcast to all in ride room (user + driver)
//       io.to(rideId).emit("driverLocationUpdate", { rideId, driverId, lat, lng });
//     });

//     // -------------------- RIDE STATUS UPDATE --------------------
//     socket.on("rideStatusUpdate", ({ rideId, status }) => {
//       const ride = rides[rideId];
//       if (!ride) return;

//       ride.status = status;
//       console.log(`📌 Ride ${rideId} status changed: ${status}`);

//       // Notify everyone in ride room
//       io.to(rideId).emit("rideStatusUpdate", { rideId, status });

//       // Optionally, clean up ride if completed
//       if (status === "completed") {
//         console.log(`🏁 Ride ${rideId} completed. Cleaning up.`);
//         delete rides[rideId];
//       }
//     });

//     // -------------------- DISCONNECT --------------------
//     socket.on("disconnect", () => {
//       console.log("❌ Client disconnected:", socket.id);
//       if (socket.driverId) {
//         console.log(`🛑 Driver ${socket.driverId} disconnected`);
//       }
//     });
//   });
// };

// // -------------------- GET IO INSTANCE --------------------
// const getIO = () => {
//   if (!io) throw new Error("❌ Socket.io not initialized!");
//   return io;
// };

// module.exports = { init, getIO };
