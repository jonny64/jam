db.ins.aggregate([
	{$project: {id: 1, amount_left: 1, currency_id: "$listing.currency_id", payment_state: 1}},
	{$group: {
		_id: {
			currency_id: "$currency_id",
			payment_state: "$payment_state"
		},
		amount_left: {$sum: "$amount_left"},
		cnt: {$sum: 1}
	}},
	{$sort: {amount_left: -1}},
	{$limit: 7}
])
.forEach(printjson);