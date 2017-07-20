var Chat = function() {
	var my = this;
	my.ws = null;
	my.connect_retry_count = 0;
	my.connect_retry_timer = null;
	
	my.send = function( msg ) {
		my.ws.send( JSON.stringify(msg) );
	}
	
	my.connect = function() {
		if( my.ws!=null ) {
			try {
				my.ws.close();
			} catch(e) {
				if( GlobalStatusBar ) {
					GlobalStatusBar.add_message( {text:"Chat WebSocket close error: "+String(e), class:"error"} );
				}
			}
		}
		if( my.connect_retry_timer ) {
			my.connect_retry_timer = null;
			my.connect_retry_count += 1;
		}
		my.ws = new WebSocket( get_ws_url("?do=chat") );
		my.ws.onopen = my.connected;
		my.ws.onmessage = my.recv;
		my.ws.onerror = my.reconnect;
		my.ws.onclose = my.reconnect;
	};
	
	my.connected = function( event ) {
		my.connect_retry_count=0;
		if( GlobalStatusBar ) {
			GlobalStatusBar.add_message( {text:"Chat WebSocket connected", emblem_css:{"background-color":"green"}} );
		}
	};
	
	my.recv = function( event ) {
		var msg = parse_result( event.data );
		if( GlobalStatusBar ) {
			GlobalStatusBar.add_message( {source: msg.src, text:msg.msg, emblem_css:{"background-color":"blue"}} );
			GlobalStatusBar.show();
		}
	};
	
	my.asymptotic_growth_function = function( x, limit, scale ) {
		return limit-1/((x+scale/limit)/scale);
	}
	my.reconnect = function( event ) {
		if( my.connect_retry_timer==null ) {
			// we use asymptotic growth for retry latencies, starting by 0 seconds, maximum 5 minutes:
			var retry_latency = Math.round( my.asymptotic_growth_function( my.connect_retry_count, 5*60, 10000 ) );
			if( GlobalStatusBar ) {
				GlobalStatusBar.add_message( {text:"Chat WebSocket error: "+String(event)+" (retry in "+String(retry_latency)+"s)", class:"error"} );
			}
			my.connect_retry_timer = window.setTimeout( my.connect, retry_latency*1000 );
		}
	};
} // Chat
