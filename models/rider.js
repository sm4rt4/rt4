const mongoose = require('mongoose');

const RiderSchema = mongoose.Schema({
	name: { type: String, required: true },
	phone: { type: String, required: true },
	hash: { type: String, required: true },
	joined: { type: Date, default: Date.now },
	orders: { type: Array, default: [] }
}, { minimize: false });

const Rider = module.exports = mongoose.model('Rider', RiderSchema);

module.exports.get = (phone, hash, callback) => {
	Rider.findOne({ phone, hash }, callback);
}

module.exports.getRider = (callback) => {
	Rider.findOne({}, callback);
}