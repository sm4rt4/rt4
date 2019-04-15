const mongoose = require('mongoose');

const OrderSchema = mongoose.Schema({
	sender: {
		phone: {
			type: String,
			required: true
		},
		address: {
			type: String,
			required: true
		},
		lat: Number,
		lng: Number
	},
	receiver: {
		phone: {
			type: String,
			required: true
		},
		address: {
			type: String,
			required: true
		},
		lat: Number,
		lng: Number
	},
	fee: {
		type: Number,
		default: 20
	},
	datetime: {
		type: Date,
		default: Date.now
	}
});

const Order = module.exports = mongoose.model('Order', OrderSchema);

module.exports.add = (orderData, callback) => {
	const newOrder = new Order(orderData);
	newOrder.save(callback);
}

module.exports.get = (orderId, callback) => {
	Order.findById(orderId, callback);
}