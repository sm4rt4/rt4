const mongoose = require('mongoose');

const UserSchema = mongoose.Schema({
	phone: { type: String, required: true },
	hash: { type: String, required: true },
	joined: { type: Date, default: Date.now },
	addresses: { type: Array, default: [] },
	orders: { type: Array, default: [] }
}, { minimize: false });

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

module.exports.getAuthUser = (phone, hash, callback) => {
	User.findOne({ phone, hash }, callback);
}

module.exports.updateHash = (phone, hash, callback) => {
	User.findOneAndUpdate({ phone }, { $set: { hash } }, { new: true }, callback);
}

module.exports.addAddress = (phone, na, callback) => {
	User.updateOne({ phone }, { $push: { addresses: na } }, callback);
}

module.exports.updateAddresses = (phone, addresses, callback) => {
	User.updateOne({ phone }, { $set: { addresses } }, callback);
}

module.exports.addOrder = (phone, orderId, callback) => {
	User.findOne({ phone }, 'orders', (err, doc) => {
		if (!err && doc != null) {
			let orders = doc.orders;
			if (orders.length >= 20) {
				orders.splice(19, orders.length - 19);
				orders.push(orderId);

				User.updateOne({ phone }, { $set: { orders } }, callback);
			} else {
				User.updateOne({ phone }, { $push: { orders: orderId } }, callback);
			}
		} else {
			User.updateOne({ phone }, { $push: { orders: orderId } }, callback);
		}
	});
}