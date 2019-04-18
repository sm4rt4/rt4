const mongoose = require('mongoose');

const OrderSchema = mongoose.Schema({
	phone: { type: String, required: true },
	pickup: { type: Object, required: true },
	delivery: { type: Object, required: true },
	charge: { type: Number, required: true },
	otp: { type: Number, required: true },
	datetime: { type: Date, default: Date.now },
	dType: { type: Number, default: 0 },
	rider: { type: Object, required: true }
});

const Order = module.exports = mongoose.model('Order', OrderSchema);

module.exports.add = (orderData, callback) => {
	const newOrder = new Order(orderData);
	newOrder.save(callback);
}

module.exports.get = (orderId, callback) => {
	Order.findById(orderId, callback);
}