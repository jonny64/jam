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
			_id: 0,
			payment_state: {
				$substr: [ "$payment_state", 0, 4 ],
			},
			created_at: 1,
			id_listing: "$listing.id",
			term_days: "$listing.term_days",
			rate: "$listing.rate_max_rate_per_period"
		}
	},
	{$match: {
		payment_state: {
			$ne: "late"
		}
	}},
])
.forEach(printjson);