const dgram = require('dgram');
const moment = require('moment');
const mongoose = require('mongoose');
const User = require('./models/user');
const Order = require('./models/order');
const Rider = require('./models/rider');
const async = require('async');
const values = require('./includes/values');
const functions = require('./includes/functions');

mongoose.connect(values.dbUrl, {
	useNewUrlParser: true,
	useFindAndModify: false
});

mongoose.connection.on('connected', () => {
	console.log(`Connected to database at ${values.dbUrl}`);
});

mongoose.connection.on('error', (err) => {
	console.log(`Database Error: ${err}`);
});

const server = dgram.createSocket('udp4');

// let phoneServer;

const loginRequests = {};
const dealt = [];

server.on('message', function (message, rinfo) {
	const msgData = JSON.parse(message.toString());
	
	if (msgData.hasOwnProperty('cTime')) {
		const cTime = msgData.cTime;

		if (dealt.indexOf(cTime) >= 0) return;
		else dealt.push(cTime);
	}

	console.log(`rinfo - ${JSON.stringify(rinfo, null, 4)}`);
	console.log(`message - ${JSON.stringify(msgData, null, 4)}`);

	const msgType = msgData.type;
	switch (msgType) {
		case 'loginRequest':
			const hash = functions.getHash(msgData.cTime);

			loginRequests[msgData.phone] = {
				uType: msgData.uType,
				hash,
				rTime: new Date(),
				rinfo
			};

			break;

		case 'tokenVerify':
			if (msgData.token == undefined) {
				sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime() }), rinfo);
				return;
			}

			functions.verifyToken(msgData.token, (err, userDoc) => {
				if (err) {
					sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime()}), rinfo);
				} else {
					oPhones[userDoc.phone] = rinfo;
					sendMessage(JSON.stringify({ type: 'tvSuccess', cTime: getTime(), doc: userDoc }), rinfo);
				}
			});
			break;

		case 'rTokenVerify':
			if (msgData.token == undefined) {
				sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime() }), rinfo);
				return;
			}

			functions.verifyRiderToken(msgData.token, (err, userDoc) => {
				if (err) {
					sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime()}), rinfo);
				} else {
					oPhones[userDoc.phone] = rinfo;
					sendMessage(JSON.stringify({ type: 'tvSuccess', cTime: getTime(), doc: userDoc }), rinfo);
				}
			});
			break;

		case 'newCall':
			if (loginRequests[msgData.phone] != null) {
				const timeRn = moment();
				const duration = moment.duration(timeRn.diff(loginRequests[msgData.phone].rTime));
				const mins = duration.asMinutes();

				if (mins <= 2) {
					const phone = msgData.phone;
					const hash = loginRequests[phone].hash;

					if (loginRequests[msgData.phone].uType == 'u') {
						async.waterfall([
							(callback) => User.exists(phone, callback),
							(exists, callback) => {
								if (exists) User.updateHash(phone, hash, callback);
								else {
									const userData = { phone, hash };
									User.add(userData, callback);
								}
							}
						], (err, userDoc) => {
							if (err) {
								sendMessage(JSON.stringify({ type: 'loginFailure', cTime: getTime() }), loginRequests[phone].rinfo);
								return;
							}
	
							const token = functions.generateToken(userDoc);
							sendMessage(JSON.stringify({ type: 'loginSuccess', cTime: getTime(), doc: userDoc, token }), loginRequests[phone].rinfo);
						});
					} else if (loginRequests[msgData.phone].uType == 'r') {
						async.waterfall([
							(callback) => Rider.updateHash(phone, hash, callback)
						], (err, userDoc) => {
							if (err) {
								sendMessage(JSON.stringify({ type: 'loginFailure', cTime: getTime() }), loginRequests[phone].rinfo);
								return;
							}
	
							const token = functions.generateToken(userDoc);
							sendMessage(JSON.stringify({ type: 'loginSuccess', cTime: getTime(), doc: userDoc, token }), loginRequests[phone].rinfo);
						});
					}
				}
			}
			break;

		case 'newAddress':
			if (msgData.token == undefined || msgData.na == undefined) {
				return;
			}

			functions.verifyToken(msgData.token, (err, userDoc) => {
				if (err) {
					return;
				} else {
					oPhones[userDoc.phone] = rinfo;

					User.addAddress(userDoc.phone, msgData.na, (err) => {
						if (err) console.log(`Error X - ${err}`);
					});
				}
			});
			break;

		case 'newOrder':
			if (msgData.token == undefined || msgData.pickup == undefined || msgData.delivery == undefined || msgData.charge == undefined || msgData.dType == undefined) {
				sendMessage(JSON.stringify({ type: 'orderFailure', cTime: getTime(), msg: 'Bad Request' }), rinfo);
				return;
			}

			let lPhone, orderDoc, rPhone;
			async.waterfall([
				(callback) => functions.verifyToken(msgData.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;

					lPhone = userDoc.phone;
					Rider.getRider(callback);
				},
				(riderDoc, callback) => {
					const riderData = { phone: riderDoc.phone, name: riderDoc.name };
					const otp = functions.getOtp();

					rPhone = riderDoc.phone;
					Order.add({ oi: functions.generateOrderId(), rider: riderData, otp, phone: lPhone, pickup: msgData.pickup, delivery: msgData.delivery, charge: msgData.charge, dType: msgData.dType }, callback);
				},
				(_orderDoc, callback) => {
					orderDoc = _orderDoc;
					User.addOrder(lPhone, orderDoc.oi, callback);
				},
				(_, callback) => {
					notify(rPhone, 'New Order', 'New Order Received');
					Rider.addOrder(rPhone, orderDoc.oi, callback);
				}
			], (err) => {
				if (err) sendMessage(JSON.stringify({ type: 'orderFailure', cTime: getTime(), msg: 'Error placing order' }), rinfo);
				else sendMessage(JSON.stringify({ type: 'orderSuccess', cTime: getTime(), doc: orderDoc }), rinfo);
			});
			break;

		case 'getOrder':
			if (msgData.token == undefined || msgData.oId == undefined) {
				console.log(`errd`);				
				return;
			}

			async.waterfall([
				(callback) => functions.verifyToken(msgData.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;
					Order.get(msgData.oId, callback);
				}
			], (err, orderDoc) => {
				console.log(`errc - ${err}`);
				console.log(`orderDoc - ${orderDoc}`);

				if (!err && orderDoc != null) sendMessage(JSON.stringify({ type: 'ofSuccess', cTime: getTime(), doc: orderDoc }), rinfo);
			});
			break;

		case 'rGetOrder':
			if (msgData.token == undefined || msgData.oId == undefined) {
				console.log(`errd`);				
				return;
			}

			async.waterfall([
				(callback) => functions.verifyRiderToken(msgData.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;
					Order.get(msgData.oId, callback);
				}
			], (err, orderDoc) => {
				console.log(`errc - ${err}`);
				console.log(`orderDoc - ${orderDoc}`);

				if (!err && orderDoc != null) sendMessage(JSON.stringify({ type: 'ofSuccess', cTime: getTime(), doc: orderDoc }), rinfo);
			});
			break;

		case 'delAddresses':
			if (msgData.token == undefined || msgData.names == undefined) {
				return;
			}

			functions.verifyToken(msgData.token, (err, userDoc) => {
				if (err) {
					console.log(`erre - ${err}`);
					return;
				} else {
					oPhones[userDoc.phone] = rinfo;

					let newAddresses = userDoc.addresses;
					for (let i = 0; i < userDoc.addresses.length; i++) {
						for (let j = 0; j < msgData.names.length; j++) {
							if (userDoc.addresses[i].name == msgData.names[j]) newAddresses.splice(i, 1);
						}
					}

					User.updateAddresses(userDoc.phone, newAddresses, (err) => {
						if (err) {
							console.log(`errf - ${err}`);
							return;
						}
					});
				}
			});
			break;

		case 'upOrder':
			if (msgData.token == undefined || msgData.oId == undefined || msgData.status == undefined || msgData.otp == undefined) {
				sendMessage(JSON.stringify({ type: 'oUpFailure', cTime: getTime() }), rinfo);
				return;
			}

			let rPhone2, oDoc;
			async.waterfall([
				(callback) => functions.verifyRiderToken(msgData.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;
					
					rPhone2 = userDoc.phone;

					Order.get(msgData.oId, (err, orderDoc) => {
						if (err) callback('ErrorX');
						else if (orderDoc == null) callback('ErrorY');
						else {
							oDoc = orderDoc;

							if (msgData.status == 3 && orderDoc.otp != msgData.otp) callback('ErrorZ');
							else callback(null);
						}
					});
				},
				(callback) => Order.updateStatus(msgData.oId, msgData.status, callback),
				(_, callback) => {
					let msg = 'Your package has been delivered';
					if (msgData.status == 1) msg = 'Your package has been picked';
					if (msgData.status == 2) msg = 'Your package is out for delivery';
					notify(oDoc.phone, 'Package Status Update', msg);

					if (oPhones[oDoc.phone] != null) sendMessage(JSON.stringify({ type: 'osUpdate', oId: msgData.oId, status: msgData.status, cTime: getTime() }), oPhones[oDoc.phone]);

					if (msgData.status == 3) {
						Rider.orderCompleted(rPhone2, msgData.oId, callback);
					} else callback(null, null);
				}
			], (err, _) => {
				if (err) console.log(`ErrorL - ${err}`);

				if (err) sendMessage(JSON.stringify({ type: 'oUpFailure', cTime: getTime() }), rinfo);
				else sendMessage(JSON.stringify({ type: 'oUpSuccess', cTime: getTime() }), rinfo);
			});
			break;
	}
});

const oPhones = {};
function notify(phone, title, msg) {
	if (oPhones[phone] != null) {
		sendMessage(JSON.stringify({ type: 'n', title, msg, cTime: getTimeWithInc(100) }), oPhones[phone]);
	}
}

function sendMessage(msg, rinfo) {
	// server.send(msg, rinfo.port, rinfo.address);

	let i = 0;
	const il = setInterval(() => {
		server.send(msg, rinfo.port, rinfo.address);
		i++;

		if (i == 5) clearInterval(il);
	}, 500);
}

function getTime() {
	const d = new Date();
	return d.getTime().toString();
}

function getTimeWithInc(inc) {
	const d = new Date();
	return '' + (d.getTime() + inc);
}

server.bind(8080);