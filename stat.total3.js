// 3 months stats
var dt_before = (new Date(ISODate().getTime() - 1000 * 60 * 60* 24 * 90)).toJSON();
print("stat since " + dt_before);
db.ins.aggregate([
	{$match: {
		created_at: { // 90 days from now
			$gt: dt_before
		}
	}},
	{$group: {
		_id: "$payment_state",
		amount_invested: {$sum: "$amount"},
		amount_received: {$sum: "$amount_received"},
		"amount_left    ": {$sum: "$amount_left"}
	}}
])
.forEach(printjson);