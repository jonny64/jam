// -4 .. -1 months stats
var dt_from = (new Date(ISODate().getTime() - 1000 * 60 * 60* 24 * 30 * 4)).toJSON();
var dt_to = (new Date(ISODate().getTime() - 1000 * 60 * 60* 24 * 30 * 1)).toJSON();
print("stat " + dt_from + ' ... ' + dt_to);
db.ins.aggregate([
	{$match: {
		created_at: {
			$gte: dt_from,
			$lte: dt_to
		}
	}},
	{
		$project: {
			payment_state: {
				$substr: [ "$payment_state", 0, 4 ],
			},
			amount: 1,
			amount_received: 1,
			amount_left: 1,
			rate: "$listing.rate_max_rate_per_period"
		}
	},
	{$group: {
		_id: "$payment_state",
		rate: {$max: "$rate"},
		amount_invested: {$sum: "$amount"},
		amount_received: {$sum: "$amount_received"},
		"amount_left    ": {$sum: "$amount_left"}
	}}
])
.forEach(printjson);