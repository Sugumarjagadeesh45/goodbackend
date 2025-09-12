
const Driver = require("../../models/driver/driver");
const Ride = require('../../models/ride'); // Make sure Ride model is imported!
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const SALT_ROUNDS = 12;
const JWT_SECRET = process.env.JWT_SECRET || "supersecret";

// Admin create driver
const createDriver = async (req, res) => {
  try {
    const { driverId, name, phone, password, vehicleType, latitude, longitude } = req.body;

    if (!driverId || !phone || !password || !latitude || !longitude) {
      return res.status(400).json({ msg: "DriverId, phone, password, latitude, longitude required" });
    }

    const existing = await Driver.findOne({ $or: [{ driverId }, { phone }] });
    if (existing) {
      return res.status(400).json({ msg: "DriverId or Phone already exists" });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const driver = new Driver({
      driverId,
      name,
      phone,
      passwordHash,
      vehicleType,
      location: {
        type: "Point",
        coordinates: [longitude, latitude],
      },
    });

    await driver.save();
    res.status(201).json({ msg: "Driver created", driverId: driver.driverId });
  } catch (err) {
    console.error("❌ Error creating driver:", err);
    res.status(400).json({ error: err.message });
  }
};

// Driver login
const loginDriver = async (req, res) => {
  try {
    const { driverId, password, latitude, longitude } = req.body;

    const driver = await Driver.findOne({ driverId });
    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    const match = await bcrypt.compare(password, driver.passwordHash);
    if (!match) return res.status(401).json({ msg: "Invalid password" });

    if (latitude && longitude) {
      driver.location = {
        type: "Point",
        coordinates: [longitude, latitude],
      };
      driver.status = "Live";
      await driver.save();

      console.log(`Driver ${driverId} logged in at latitude: ${latitude}, longitude: ${longitude}`);
    }

    const token = jwt.sign(
      { sub: driver._id, driverId: driver.driverId },
      JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      token,
      mustChangePassword: driver.mustChangePassword,
      driver: {
        driverId: driver.driverId,
        name: driver.name,
        status: driver.status,
        vehicleType: driver.vehicleType,
        location: driver.location,
      },
    });
  } catch (err) {
    console.error("❌ Error in loginDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

// Change password
const changePassword = async (req, res) => {
  try {
    const { driverId, oldPassword, newPassword } = req.body;

    const driver = await Driver.findOne({ driverId });
    if (!driver) {
      return res.status(404).json({ msg: "Driver not found" });
    }

    const match = await bcrypt.compare(oldPassword, driver.passwordHash);
    if (!match) {
      return res.status(400).json({ msg: "Old password incorrect" });
    }

    driver.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    driver.mustChangePassword = false;
    await driver.save();

    res.json({ msg: "Password changed successfully" });
  } catch (err) {
    console.error("❌ Error in changePassword:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get all drivers
const getDrivers = async (req, res) => {
  try {
    const drivers = await Driver.find().sort({ createdAt: -1 });
    res.json(drivers);
  } catch (err) {
    console.error("❌ Error in getDrivers:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update driver (exclude password updates here)
const updateDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const update = { ...req.body };

    if (update.password || update.passwordHash) {
      delete update.password;
      delete update.passwordHash;
    }

    if (update.latitude && update.longitude) {
      update.location = {
        type: "Point",
        coordinates: [update.longitude, update.latitude],
      };
      delete update.latitude;
      delete update.longitude;
    }

    const driver = await Driver.findOneAndUpdate({ driverId }, update, { new: true });
    if (!driver) {
      return res.status(404).json({ msg: "Driver not found" });
    }

    res.json(driver);
  } catch (err) {
    console.error("❌ Error in updateDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

// Delete driver
const deleteDriver = async (req, res) => {
  try {
    const { driverId } = req.params;
    const deleted = await Driver.findOneAndDelete({ driverId });

    if (!deleted) {
      return res.status(404).json({ msg: "Driver not found" });
    }

    res.json({ msg: "Driver deleted" });
  } catch (err) {
    console.error("❌ Error in deleteDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

// Nearest drivers API
const getNearestDrivers = async (req, res) => {
  try {
    const { latitude, longitude, maxDistance = 5000 } = req.query;

    const drivers = await Driver.find({
      location: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(longitude), parseFloat(latitude)] },
          $maxDistance: parseInt(maxDistance),
        },
      },
    });

    res.json(drivers);
  } catch (err) {
    console.error("❌ Error in getNearestDrivers:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update location (protected route)
const updateLocation = async (req, res) => {
  try {
    const { driverId } = req.user;

    const { latitude, longitude } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({ msg: "Latitude & longitude required" });
    }

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      {
        location: { type: "Point", coordinates: [longitude, latitude] },
        status: "Live",
      },
      { new: true }
    );

    if (!driver) return res.status(404).json({ msg: "Driver not found" });

    res.json({ msg: "Location updated", location: driver.location, status: driver.status });
  } catch (err) {
    console.error("❌ Error in updateLocation:", err);
    res.status(500).json({ error: err.message });
  }
};

// Logout driver (protected route)
const logoutDriver = async (req, res) => {
  try {
    const { driverId } = req.user;

    const driver = await Driver.findOneAndUpdate(
      { driverId },
      { status: "Offline", logoutTime: new Date().toISOString() },
      { new: true }
    );

    res.json({ msg: "Driver logged out", driver });
  } catch (err) {
    console.error("❌ Error in logoutDriver:", err);
    res.status(500).json({ error: err.message });
  }
};

// Get ride by ID (protected route)
// In driverController.js
const getRideById = async (req, res) => {
  try {
    const { rideId } = req.params;
    console.log(`🔍 Fetching ride with RAID_ID: ${rideId}`);
    
    const ride = await Ride.findOne({ RAID_ID: rideId })
      .populate("user", "name customerId phone")
      .populate("driver", "driverId name phone vehicleType");
      
    if (!ride) {
      console.log(`❌ Ride not found with RAID_ID: ${rideId}`);
      return res.status(404).json({ msg: "Ride not found" });
    }
    
    // Log the ride object to see what's being returned
    console.log("Ride object being returned:", ride);
    
    // Explicitly return the ride with all fields
    res.json({
      _id: ride._id,
      RAID_ID: ride.RAID_ID, // Ensure this is included
      customerId: ride.customerId,
      name: ride.name,
      pickupLocation: ride.pickupLocation,
      dropoffLocation: ride.dropoffLocation,
      pickupCoordinates: ride.pickupCoordinates,
      dropoffCoordinates: ride.dropoffCoordinates,
      fare: ride.fare,
      distance: ride.distance,
      status: ride.status,
      user: ride.user,
      driver: ride.driver
    });
  } catch (err) {
    console.error("❌ Error in getRideById:", err);
    res.status(500).json({ error: err.message });
  }
};

// Update ride status (protected route)
// In driverController.js, update the updateRideStatus function:
const updateRideStatus = async (req, res) => {
  try {
    const { rideId } = req.params;
    const { status } = req.body;
    const { driverId } = req.user;
    
    console.log(`🚗 Driver ${driverId} attempting to ${status} ride ${rideId}`);
    
    if (!["Accepted", "Completed", "Cancelled"].includes(status)) {
      console.log(`❌ Invalid status: ${status}`);
      return res.status(400).json({ msg: "Invalid status" });
    }
    
    const ride = await Ride.findOne({ RAID_ID: rideId }).populate("user");
    if (!ride) {
      console.log(`❌ Ride not found with ID: ${rideId}`);
      return res.status(404).json({ msg: "Ride not found" });
    }
    
    console.log(`📋 Current ride status: ${ride.status}`);
    
    if (status === "Accepted") {
      if (ride.status !== "pending") {
        console.log(`❌ Ride already taken or completed. Current status: ${ride.status}`);
        return res.status(400).json({ msg: "Ride already taken or completed" });
      }
      ride.driver = driverId;
    }
    
    if (status === "Cancelled") {
      ride.driver = null;
    }
    
    ride.status = status.toLowerCase();
    await ride.save();
    
    console.log(`✅ Ride status updated to: ${ride.status}`);
    
    const io = req.app.get('io');
    if (io && ride.user) {
      io.to(ride.user._id.toString()).emit("rideStatusUpdate", {
        rideId: ride.RAID_ID,
        status: ride.status,
        driverId,
      });
      console.log(`📡 Emitted rideStatusUpdate to user ${ride.user._id}`);
    }
    
    res.json({
      msg: "Ride updated",
      ride: {
        _id: ride._id,
        RAID_ID: ride.RAID_ID,
        status: ride.status,
        user: ride.user,
        driver: ride.driver,
      },
    });
  } catch (err) {
    console.error("❌ Error in updateRideStatus:", err);
    res.status(500).json({ error: err.message });
  }
};

module.exports = {
  createDriver,
  loginDriver,
  changePassword,
  updateRideStatus,
  updateLocation,
  getDrivers,
  updateDriver,
  deleteDriver,
  getNearestDrivers,
  logoutDriver,
  getRideById,
};
