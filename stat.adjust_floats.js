var cursor = db.ins.find();
while (cursor.hasNext()) {
	var doc = cursor.next();
	for (key in doc) {
		if (key.match(/^amount.*/i) && !isNaN(doc[key])) {
			doc[key] = parseFloat(doc[key]);
			// print('found string key: ' + key + '; adjust to ' + doc[key]);
			db.ins.update({ _id : doc._id }, doc );
		}
	}
}