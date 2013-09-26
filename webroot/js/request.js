var RequestQueue = function( parms ) {
	var my = this;
	my.queue = {};
	my.add = function( parms, key ) {
		if( key==undefined ) {
			key = "default";
		}
		if( my.queue[key]==undefined ) {
			my.queue[key] = [];
		}
		my.queue[key].push( parms );
	};
	my.process = function() {
		for( var key in my.queue ) {
			if( my.queue[key] && my.queue[key].shift ) {
				var first = my.queue[key][0];
				if( first && !first.running ) {
					first.running = true;
					first.beforeSend = function( xhr, settings ) {
						xhr.request_parms = first;
						xhr.request_key = key;
					}
					$.ajax( first ).always( function(a,status,c) {
						var xhr = status == "success" ? c : a;
						if( xhr.request_parms===my.queue[xhr.request_key][0] ) {
							my.queue[xhr.request_key].shift();
							my.process();
						} else debugger;
					} );
				}
			} else debugger;
		}
	};
	my.test = function() {
		my.add( {url:'http://localhost:1234', complete: function(xhr, status) {
			alert( status );
		}} );
		my.add( {url:'http://localhost:1235', complete: function(xhr, status) {
			alert( status );
		}} );
		my.add( {url:'http://localhost:1236', complete: function(xhr, status) {
			alert( status );
		}}, "anderes" );
		my.process();
		my.process();
		window.setTimeout( my.process, 1 );
		window.setTimeout( my.process, 10 );
		window.setTimeout( my.process, 100 );
	}
};

var GlobalRequestQueue = new RequestQueue();
