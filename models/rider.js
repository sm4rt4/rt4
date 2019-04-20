const mongoose = require('mongoose');

const RiderSchema = mongoose.Schema({
	name: { type: String, required: true },
	phone: { type: String, required: true },
	hash: { type: String, required: true },
	joined: { type: Date, default: Date.now },
	pending: { type: Array, default: [] },
	completed: { type: Array, default: [] }
}, { minimize: false });

const Rider = module.exports = mongoose.model('Rider', RiderSchema);

module.exports.get = (phone, hash, callback) => {
	Rider.findOne({ phone, hash }, callback);
}

module.exports.getAuthUser = (phone, hash, callback) => {
	Rider.findOne({ phone, hash }, callback);
}

module.exports.updateHash = (phone, hash, callback) => {
	Rider.findOneAndUpdate({ phone }, { $set: { hash } }, { new: true }, callback);
}

module.exports.getRider = (callback) => {
	Rider.findOne({}, callback);
}

module.exports.addOrder = (phone, orderId, callback) => {
	Rider.updateOne({ phone }, { $push: { pending: orderId } }, callback);	
}

module.exports.orderCompleted = (phone, orderId, callback) => {
	Rider.updateOne({ phone }, { $pull: { pending: ObjectId(orderId) }, $push: { completed: ObjectId(orderId) } }, callback);
}

// db.riders.remove({});
// db.riders.insertOne({ name: 'Gulshan', phone: '1111111111', hash: 'abcdhash', pending: [], completed: [], joined: 1555584373808 });