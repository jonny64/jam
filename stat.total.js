db.ins.aggregate([
	{$project: {id: 1, amount_left: 1, payment_state: 1}},
	{$group: { _id: "$payment_state", amount_left: {$sum: "$amount_left"}}}
])
.forEach(printjson);