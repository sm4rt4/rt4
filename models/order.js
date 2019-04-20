const mongoose = require('mongoose');

const OrderSchema = mongoose.Schema({
	oi: { type: String, required: true },
	phone: { type: String, required: true },
	pickup: { type: Object, required: true },
	delivery: { type: Object, required: true },
	charge: { type: Number, required: true },
	otp: { type: Number, required: true },
	datetime: { type: Date, default: Date.now },
	dType: { type: Number, default: 0 },
	status: { type: Number, default: 0 },
	rider: { type: Object, required: true }
});

// -1 = Canceled
// 0 = Yet to be Pickup
// 1 = Picked
// 2 = On the Way
// 3 = Delivered

const Order = module.exports = mongoose.model('Order', OrderSchema);

module.exports.add = (orderData, callback) => {
	const newOrder = new Order(orderData);
	newOrder.save(callback);
}

module.exports.get = (oi, callback) => {
	Order.findOne({ oi }, callback);
}

module.exports.updateStatus = (oi, status, callback) => {
	Order.updateOne({ oi }, { status }, callback);
}