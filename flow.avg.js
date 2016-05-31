var dt_from = (new Date(ISODate().getTime() - 1000 * 60 * 60* 24 * 30 * 1)).toJSON();

db.trs.aggregate([
	{$match: {
		dt: {$gte: dt_from},
		type: {$eq: "Payment Received"}
	}},
	{$project: {dt:1, total: 1}},
	{$group: { _id: null, total: {$sum: "$total"}}}
])
.forEach(printjson);