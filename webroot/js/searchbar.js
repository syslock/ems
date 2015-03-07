var SearchBar = function ( parms ) {
	var my = this;
	my.entry_parent = parms.entry_parent;
	my.result_handler = parms.result_handler;
	my.outer_width = parms.outer_width;
	my.result_types = parms.result_types;
	my.order_by = parms.order_by;
	my.order_reverse = parms.order_reverse;
	my.range_limit = parms.range_limit;
	my.on_ready = parms.on_ready;
	my.empty_search = parms.empty_search ? parms.empty_search : {};
	my.new_search_handler = parms.new_search_handler ? parms.new_search_handler : function() {};
	my.recent_search = {};
	my.auto_search_timeout = parms.auto_search_timeout ? parms.auto_search_timeout : 2000; //ms
	my.search_count = 0;
	
	my.handle_keydown_event = function( evt ) {
		var propagate = true;
		switch( evt.which )
		{
			case 13: // Enter
				propagate = false; // prevent line breaks in contentEditable div
				break;
		}
		return propagate;
	};
	
	my.handle_keyup_event = function( evt ) {
		var propagate = true;
		switch( evt.which )
		{
			case 13: // Enter
				my.search();
				break;
			case 27: // Escape
				my.hide_apropos_hints();
				if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
				break;
			case 40: // Down
				my.select_apropos_hint('next');
				if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
				break;
			case 38: // Up
				my.select_apropos_hint('prev');
				if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
				break;
			case 37: // Left
				my.show_apropos_hints();
				if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
				break;
			case 39: // Right
				my.show_apropos_hints();
				if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
				break;
			default:
				my.show_apropos_hints();
				if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
				my.auto_search_timeout_obj = window.setTimeout( function() {
					my.search();
				}, my.auto_search_timeout );
		}
		return propagate;
	};
	
	my.search = function( parms ) {
		var parms = parms ? parms : {};
		parms.phrase = parms.phrase ? parms.phrase : my.entry ? my.entry.text() : '';
		var search_definition = { 
			phrase : parms.phrase, result_types : my.result_types,
			order_by : my.order_by, order_reverse : my.order_reverse
		};
		if( !search_definition.phrase.length ) {
			$.extend( search_definition, my.empty_search );
		}
		var new_search_count = parms.search_count==my.search_count ? my.search_count : my.search_count+1;
		if( $.param(my.recent_search) != $.param(search_definition) ||  my.search_count != new_search_count ) {
			my.new_search_handler( {old_search: my.recent_search, new_search: search_definition,
									old_search_count: my.search_count, new_search_count: new_search_count} );
			my.recent_search = search_definition;
			my.search_count = new_search_count;
		}
		if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
		parms.range_offset = parms.range_offset ? parms.range_offset : 0;
		search_args = $.extend( {range_limit: my.range_limit, range_offset: parms.range_offset}, search_definition );
		get_module( 'search', {
			args : search_args,
			done : function(result) {
				result = parse_result( result );
				my.hide_apropos_hints();
				var bubble = true;
				if( parms.done ) bubble = parms.done( result ); // optional single search result handler
				if( bubble==undefined || bubble ) my.result_handler( result ); // generic searchbar result handler
			}
		} );
	};
	
	my.apropos_word = null;
	my.show_apropos_hints = function() {
		var word = get_cursor_word( my.entry[0], {separators:" \t\n\r:"} );
		if( word && word != my.apropos_word ) {
			my.apropos_word = word;
			get_module( 'search', {args : {apropos : word},
				done : function(result) {
					result = parse_result( result );
					my.apropos_spacer.text( get_input_text_before_cursor(my.entry[0], {remove_trailing_word: true, separators:" \t\n\r:"}) );
					my.apropos_hints.empty();
					my.apropos_hints.show();
					for( var i=0; i<result.length; i++ ) {
						my.apropos_hints.append( $('<div>').text(result[i][0]).addClass('apropos-hint') )
					}
					var sel = window.getSelection();
					if( sel.rangeCount ) {
						var rg = sel.getRangeAt(0);
						var rect = rg.getBoundingClientRect();
					}
				}
			} );
		}
	};
	
	my.select_apropos_hint = function() {};
	
	my.hide_apropos_hints = function() {
		if( my.apropos_hints ) my.apropos_hints.hide();
	};
	
	if( my.entry_parent ) {
		get_tpl( "elements/searchbar.html", { done : function(result) {
			my.entry_parent.html( result );
			my.entry = $( ".searchbar-entry", my.entry_parent );
			my.entry[0].contentEditable = true;
			my.entry.outerWidth( my.outer_width );
			my.entry.css( 'min-width', my.entry.css('width') );
			my.entry.css( 'width', '' );
			my.entry.on( 'keydown', my.handle_keydown_event );
			my.entry.on( 'keyup', my.handle_keyup_event );
			my.apropos_hints = $( ".apropos-hints", my.entry_parent );
			my.apropos_spacer = $( ".apropos-spacer", my.entry_parent );
			if( my.on_ready ) {
				my.on_ready();
			}
		}, fail : function(result) {
			show_error( result )
		} } );
	} else {
		if( my.on_ready ) {
			my.on_ready();
		}
	}
} // SearchBar
