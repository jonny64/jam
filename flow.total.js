db.trs.aggregate([
	{$project: {total: 1}},
	{$group: { _id: null, total: {$sum: "$total"}}}
])
.forEach(printjson);