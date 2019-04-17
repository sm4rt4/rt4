const dgram = require('dgram');
const moment = require('moment');
const mongoose = require('mongoose');
const User = require('./models/user');
const Order = require('./models/order');
const async = require('async');
const values = require('./includes/values');
const functions = require('./includes/functions');
const jwt = require('jsonwebtoken');

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
		// case 'phoneHi':
		// 	phoneServer = { address: rinfo.address, port: rinfo.port };
		// 	break;

		case 'loginRequest':
			const hash = functions.getHash(msgData.cTime);

			loginRequests[msgData.phone] = {
				hash,
				rTime: new Date(),
				rinfo
			};

			// console.log(JSON.stringify(loginRequests, null, 4));
			break;

		case 'tokenVerify':
			if (msgData.token == undefined) {
				sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime() }), rinfo);
				return;
			}

			jwt.verify(msgData.token, values.secret, (err, decoded) => {
				if (err) {
					console.log(`Error - ${err}`);
					sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime()}), rinfo);
				}
				else {
					User.getAuthUser(decoded.phone, decoded.hash, (err, userDoc) => {
						if (err || userDoc == null) {
							console.log(`Error - ${err}`);
							sendMessage(JSON.stringify({ type: 'tvFailure', cTime: getTime()}), rinfo);
						} else {
							sendMessage(JSON.stringify({ type: 'tvSuccess', cTime: getTime(), doc: userDoc }), rinfo);
						}
					});
					// console.log(JSON.stringify(decoded, null, 4));
					// sendMessage(JSON.stringify({ type: 'tvSuccess', cTime: getTime(), doc: decoded }), rinfo);
				}
			});
			break;

		case 'newCall':
			if (loginRequests[msgData.phone] != null) {
				// console.log(JSON.stringify(loginRequests[msgData.phone], null, 4));

				const timeRn = moment();
				const duration = moment.duration(timeRn.diff(loginRequests[msgData.phone].rTime));
				const mins = duration.asMinutes();

				if (mins <= 2) {
					const phone = msgData.phone;
					const hash = loginRequests[phone].hash;

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
				}
			}
			break;

		case 'newOrder':
			if (msgData.token == undefined) {
				sendMessage(JSON.stringify({ type: 'orderFailure', cTime: getTime(), msg: 'User not logged in' }), rinfo);
				return;
			}
			const token = msgData.token;

			if (msgData.sa == undefined || msgData.ra == undefined || msgData.rPhone == undefined) {
				sendMessage(JSON.stringify({ type: 'orderFailure', cTime: getTime(), msg: 'Please enter Pickup and Delivery locations' }), rinfo);
				return;
			}

			const sAddress = msgData.sa;
			const rAddress = msgData.ra;
			const rPhone = msgData.rPhone;

			if (sAddress == '' || rAddress == '' || rPhone == '') {
				sendMessage(JSON.stringify({ type: 'orderFailure', cTime: getTime(), msg: 'Please enter Pickup and Delivery locations' }), rinfo);
				return;
			}

			let sPhone;
			async.waterfall([
				(callback) => jwt.verify(token, values.secret, callback),
				(decoded, callback) => {
					sPhone = decoded.phone;
					User.exists(sPhone, callback);
				},
				(exists, callback) => {
					if (!exists) callback('User not logged in');
					else {
						const orderData = {
							sender: {
								phone: sPhone,
								address: sAddress
							},
							receiver: {
								phone: rPhone,
								address: rAddress
							}
						};
						Order.add(orderData, callback);
					}
				},
			], (err, orderDoc) => {
				if (err) {
					sendMessage(JSON.stringify({ type: 'orderFailure', cTime: getTime(), msg: err }), rinfo);
					return;
				}

				sendMessage(JSON.stringify({ type: 'orderSuccess', cTime: getTime(), doc: orderDoc }), rinfo);
			});
			
			break;
	}
});

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

server.bind(8080);