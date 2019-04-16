const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
	phone: {
		type: String,
		required: true
	},
	hash: {
		type: String,
		required: true
	},
	addresses: {
		type: Array,
		default: []
	},
	orders: {
		type: Array,
		default: []
	}
});

const User = module.exports = mongoose.model('User', UserSchema);

module.exports.add = (userData, callback) => {
	const newUser = new User(userData);
	newUser.save(callback);
}

module.exports.exists = (phone, callback) => {
	User.findOne({ phone }, (err, doc) => {
		if (err) callback('Error');
		else callback(null, doc != null);
	});
}

module.exports.get = (phone, callback) => {
	User.findOne({ phone }, callback);
}

module.exports.updateHash = (phone, hash, callback) => {
	User.findOneAndUpdate({ phone }, { $set: { hash } }, { new: true }, callback);
}

module.exports.addOrder = (phone, orderId, callback) => {
	User.updateOne({ phone }, { $push: { orders: orderId } }, callback);
}