var RangeScrollLoader = function ( parms ) {
	var my = this;
	my.scroll_container = parms.scroll_container;
	my.scroll_handler = parms.scroll_handler;
	my.scroll_handler_parms = parms.scroll_handler_parms ? parms.scroll_handler_parms : {};
	my.reload_latency = parms.reload_latency ? parms.reload_latency : 1000; //ms
	my.range_offset = parms.range_start ? parms.range_start : 0;
	my.range_step = parms.range_step ? parms.range_step : 10;
	my.scroll_time = (new Date()).getTime();
	my.range_offsets_loaded = {};
	
	my.document_scroll_condition = function() {
		var scrollTop = my.scroll_container.document.documentElement.scrollTop || my.scroll_container.document.body.scrollTop;
		var offsetHeight = my.scroll_container.document.body.offsetHeight;
		var clientHeight = my.scroll_container.document.documentElement.clientHeight;
		return offsetHeight <= scrollTop + clientHeight;
	}
	my.element_scroll_condition = function() {
		var scrollTop = my.scroll_container.scrollTop;
		var offsetHeight = my.scroll_container.offsetHeight;
		var clientHeight = my.scroll_container.clientHeight;
		return offsetHeight <= scrollTop + clientHeight;
	}
	my.scroll_condition = my.document_scroll_condition;
	if( parms.scroll_condition ) {
		if( typeof(parms.scroll_condition)=="string" ) {
			my.scroll_condition = my[ parms.scroll_condition ];
		}
		if( typeof(parms.scroll_condition)=="function" ) {
			my.scroll_condition = parms.scroll_condition;
		}
	}
	if( typeof(my.scroll_condition)!="function" ) {
		show_error( "Invalid type for scroll_condition: "+typeof(my.scroll_condition)+"! Need function!" )
	}
	
	my.handle_scroll_event = function() {
		if( my.scroll_condition() ) {
			// Scroll end detected
			var new_scroll_time = (new Date()).getTime();
			if( (new_scroll_time - my.scroll_time) > my.reload_latency ) {
				// Mindestwartezeit für Nachladeaktionen überschritten
				my.scroll_time = new_scroll_time;
				my.range_offset += my.range_step;
				if( my.range_offsets_loaded[ my.range_offset ]!=true ) {
					my.range_offsets_loaded[ my.range_offset ] = true;
					var merged_parms = { range_offset: my.range_offset, range_limit: my.range_step }
					for( key in my.scroll_handler_parms ) merged_parms[key] = my.scroll_handler_parms[key];
					my.scroll_handler( merged_parms );
				} else {
					// discard duplicate event
				}
			}
		}
	};
	
	my.start = function() {
		$(my.scroll_container).on( 'scroll', my.handle_scroll_event );
	}
	my.stop = function() {
		$(my.scroll_container).off( 'scroll', null, my.handle_scroll_event );
	}
} //RangeScrollLoader
