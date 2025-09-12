// routes/adminRoutes.js
const express = require('express');
const router = express.Router();
const adminController = require('../controllers/adminController');

// User & Driver Management
router.get('/dashboard-data', adminController.getDashboardData);
router.get('/users', adminController.getUsers);
router.get('/drivers', adminController.getDrivers);
router.put('/driver/:id/toggle', adminController.toggleDriverStatus);

// Rides
router.get('/rides', adminController.getRides);
router.post('/ride/:rideId/assign', adminController.assignRide);

// Points & Stock
router.post('/user/:id/adjust-points', adminController.adjustUserPoints);
router.post('/grocery/adjust-stock', adminController.adjustGroceryStock);

module.exports = router;
