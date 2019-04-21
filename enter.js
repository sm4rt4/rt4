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
const largeMessages = {};

server.on('message', function (message, rinfo) {
	const msgData = JSON.parse(message.toString());

	// make sure the message has 'head' and 'body'
	if (!msgData.hasOwnProperty('h') && !msgData.hasOwnProperty('b')) return;

	const head = msgData.h;
	const uid = head.u;

	// make sure the request hasn't been dealt with yet
	if (dealt.indexOf(uid) >= 0) return;
	else dealt.push(uid);

	// check if full message or part
	let body;
	if (head.hasOwnProperty('g') && head.hasOwnProperty('t') && head.hasOwnProperty('i')) {
		const group = head.g;
		if (!largeMessages[group]) largeMessages[group] = {
			total: head.t,
			left: head.t,
			parts: []
		};

		const partStr = msgData.b;
		console.log(`partStr - ${partStr}`);

		largeMessages[group].parts.push({ index: head.i, str: partStr });
		largeMessages[group].left -= partStr.length;

		if (largeMessages[group].left == 0) {
			let fullBodyString = '';
			const parts = largeMessages[group].parts;
			for (let i = 0; i < parts.length; i++) {
				for (let j = 0; j < parts.length; j++) {
					if (i == parts[j].index) {
						fullBodyString = fullBodyString.concat(parts[j]);
						break;
					}
				}
			}

			console.log(`fullBodyString - ${fullBodyString}`);
			body = JSON.parse(fullBodyString);
		}
		else return;
	} else body = msgData.b;

	console.log(`rinfo - ${JSON.stringify(rinfo, null, 4)}`);
	console.log(`head - ${JSON.stringify(head, null, 4)}`);
	console.log(`body - ${JSON.stringify(body, null, 4)}`);

	switch (body.type) {
		case 'loginRequest':
			const hash = functions.getHash(uid);

			loginRequests[body.phone] = {
				uType: body.uType,
				hash,
				rTime: new Date(),
				rinfo
			};

			break;

		case 'tokenVerify':
			if (body.token == undefined) {
				sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime() }), rinfo);
				return;
			}

			functions.verifyToken(body.token, (err, userDoc) => {
				if (err) {
					sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime()}), rinfo);
				} else {
					oPhones[userDoc.phone] = rinfo;
					sendMessage(JSON.stringify({ type: 'tvSuccess', cTime: getTime(), doc: userDoc }), rinfo);
				}
			});
			break;

		case 'rTokenVerify':
			if (body.token == undefined) {
				sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime() }), rinfo);
				return;
			}

			functions.verifyRiderToken(body.token, (err, userDoc) => {
				if (err) {
					sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime()}), rinfo);
				} else {
					oPhones[userDoc.phone] = rinfo;
					sendMessage(JSON.stringify({ type: 'tvSuccess', cTime: getTime(), doc: userDoc }), rinfo);
				}
			});
			break;

		case 'newCall':
			if (loginRequests[body.phone] != null) {
				const timeRn = moment();
				const duration = moment.duration(timeRn.diff(loginRequests[body.phone].rTime));
				const mins = duration.asMinutes();

				if (mins <= 2) {
					const phone = body.phone;
					const hash = loginRequests[phone].hash;

					if (loginRequests[body.phone].uType == 'u') {
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
					} else if (loginRequests[body.phone].uType == 'r') {
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
			if (body.token == undefined || body.na == undefined) {
				return;
			}

			functions.verifyToken(body.token, (err, userDoc) => {
				if (err) {
					return;
				} else {
					oPhones[userDoc.phone] = rinfo;

					User.addAddress(userDoc.phone, body.na, (err) => {
						if (err) console.log(`Error X - ${err}`);
					});
				}
			});
			break;

		case 'newOrder':
			if (body.token == undefined || body.pickup == undefined || body.delivery == undefined || body.charge == undefined || body.dType == undefined) {
				sendMessage(JSON.stringify({ type: 'orderFailure', cTime: getTime(), msg: 'Bad Request' }), rinfo);
				return;
			}

			let lPhone, orderDoc, rPhone;
			async.waterfall([
				(callback) => functions.verifyToken(body.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;

					lPhone = userDoc.phone;
					Rider.getRider(callback);
				},
				(riderDoc, callback) => {
					const riderData = { phone: riderDoc.phone, name: riderDoc.name };
					const otp = functions.getOtp();

					rPhone = riderDoc.phone;
					Order.add({ oi: functions.generateOrderId(), rider: riderData, otp, phone: lPhone, pickup: body.pickup, delivery: body.delivery, charge: body.charge, dType: body.dType }, callback);
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
			if (body.token == undefined || body.oId == undefined) {
				console.log(`errd`);				
				return;
			}

			async.waterfall([
				(callback) => functions.verifyToken(body.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;
					Order.get(body.oId, callback);
				}
			], (err, orderDoc) => {
				console.log(`errc - ${err}`);
				console.log(`orderDoc - ${orderDoc}`);

				if (!err && orderDoc != null) sendMessage(JSON.stringify({ type: 'ofSuccess', cTime: getTime(), doc: orderDoc }), rinfo);
			});
			break;

		case 'rGetOrder':
			if (body.token == undefined || body.oId == undefined) {
				console.log(`errd`);				
				return;
			}

			async.waterfall([
				(callback) => functions.verifyRiderToken(body.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;
					Order.get(body.oId, callback);
				}
			], (err, orderDoc) => {
				console.log(`errc - ${err}`);
				console.log(`orderDoc - ${orderDoc}`);

				if (!err && orderDoc != null) sendMessage(JSON.stringify({ type: 'ofSuccess', cTime: getTime(), doc: orderDoc }), rinfo);
			});
			break;

		case 'delAddresses':
			if (body.token == undefined || body.names == undefined) {
				return;
			}

			functions.verifyToken(body.token, (err, userDoc) => {
				if (err) {
					console.log(`erre - ${err}`);
					return;
				} else {
					oPhones[userDoc.phone] = rinfo;

					let newAddresses = userDoc.addresses;
					for (let i = 0; i < userDoc.addresses.length; i++) {
						for (let j = 0; j < body.names.length; j++) {
							if (userDoc.addresses[i].name == body.names[j]) newAddresses.splice(i, 1);
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
			if (body.token == undefined || body.oId == undefined || body.status == undefined || body.otp == undefined) {
				sendMessage(JSON.stringify({ type: 'oUpFailure', cTime: getTime() }), rinfo);
				return;
			}

			let rPhone2, oDoc;
			async.waterfall([
				(callback) => functions.verifyRiderToken(body.token, callback),
				(userDoc, callback) => {
					oPhones[userDoc.phone] = rinfo;
					
					rPhone2 = userDoc.phone;

					Order.get(body.oId, (err, orderDoc) => {
						if (err) callback('ErrorX');
						else if (orderDoc == null) callback('ErrorY');
						else {
							oDoc = orderDoc;

							if (body.status == 3 && orderDoc.otp != body.otp) callback('ErrorZ');
							else callback(null);
						}
					});
				},
				(callback) => Order.updateStatus(body.oId, body.status, callback),
				(_, callback) => {
					let msg = 'Your package has been delivered';
					if (body.status == 1) msg = 'Your package has been picked';
					if (body.status == 2) msg = 'Your package is out for delivery';
					notify(oDoc.phone, 'Package Status Update', msg);

					if (oPhones[oDoc.phone] != null) sendMessage(JSON.stringify({ type: 'osUpdate', oId: body.oId, status: body.status, cTime: getTime() }), oPhones[oDoc.phone]);

					if (body.status == 3) {
						Rider.orderCompleted(rPhone2, body.oId, callback);
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

const MAX_PACKET_SIZE = 508;
function sendMessage(msg, rinfo) {
	if (msg.length > MAX_PACKET_SIZE) {

	}

	let i = 0;
	const il = setInterval(() => {
		server.send(msg, rinfo.port, rinfo.address);
		i++;

		if (i == 10) clearInterval(il);
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