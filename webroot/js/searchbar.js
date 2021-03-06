// FIXME: module encapsulation:
var SearchBar = null;

define(["jquery"], function($) {
SearchBar = function( parms ) {
	var my = this;
	parms = parms ? parms : {};
	my.init( parms );
};

SearchBar.prototype.init = function( parms ) {
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
	my.apropos_hints_enabled = parms.apropos_hints_enabled ? parms.apropos_hints_enabled : false;
	my.recursive = parms.recursive ? parms.recursive : {children: false, parents: false};
	my.apropos_word = null;
	if( my.template==undefined ) {
		// FIXME: We should try to do only one request for the template,
		//        even if a bunch of objects are initiated the same time,
		//        e.g. at initial page load.
		GlobalRequestQueue.add({
			module : "render",
			args : {tpl : "elements/searchbar.html"},
			done : function(result) {
				SearchBar.prototype.template = result;
				if( my.activity_template==undefined ) {
					GlobalRequestQueue.add({
						module : "render",
						args : {tpl : "elements/activity-bar.html"},
						done : function(result) {
							SearchBar.prototype.activity_template = result;
							my.init( parms );
						},
						fail : function(result) {
							parse_result( result );
						}
					});
					GlobalRequestQueue.process();
				}
			}, 
			fail : function(result) {
				parse_result( result );
			}
		});
		GlobalRequestQueue.process();
	} else {
		if( my.entry_parent ) {
			my.entry_parent.html( my.template );
			my.interface = $( ".searchbar-interface", my.entry_parent );
			my.entry = $( ".searchbar-entry", my.entry_parent );
			my.entry[0].contentEditable = true;
			if( my.outer_width != undefined ) {
				my.entry.outerWidth( my.outer_width );
				my.entry.css( 'min-width', my.entry.css('width') );
				my.entry.css( 'width', '' );
			}
			my.entry.on( "keydown", function(evt) { return my.handle_keydown_event(evt); } )
			my.entry.on( "keyup", function(evt) { return my.handle_keyup_event(evt); } )
			my.buttons = $( ".searchbar-buttons", my.entry_parent );
			my.button_search = $( ".searchbar-button-search", my.entry_parent );
			my.button_search.on( 'click', function() { my.search(); } );
			my.button_clear = $( ".searchbar-button-clear", my.entry_parent );
			my.button_clear.on( 'click', function() { my.clear(); } );
			my.apropos_hints = $( ".apropos-hints", my.entry_parent );
			my.apropos_spacer = $( ".apropos-spacer", my.entry_parent );
		}
		my.activity_bar_container = parms.activity_bar_container;
		if( my.activity_bar_container ) {
			$(my.activity_bar_container).html( my.activity_template );
			my.activity_bar = $( ".activity-bar", my.activity_bar_container );
		}
		if( my.on_ready ) {
			my.on_ready();
		}
	}
}

SearchBar.prototype.handle_keydown_event = function( evt ) {
	var my = this;
	var propagate = true;
	switch( evt.which )
	{
		case 13: // Enter
			propagate = false; // prevent line breaks in contentEditable div
			break;
	}
	return propagate;
};

SearchBar.prototype.handle_keyup_event = function( evt ) {
	var my = this;
	var propagate = true;
	switch( evt.which )
	{
		case 13: // Enter
			my.search();
			break;
		case 27: // Escape
			if( my.apropos_hints_enabled ) {
				my.hide_apropos_hints();
			} else {
				my.clear();
			}
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
				my.search( {discard_unchanged:true} );
			}, my.auto_search_timeout );
	}
	return propagate;
};

SearchBar.prototype.search = function( parms ) {
	var my = this;
	var parms = parms ? parms : {};
	parms.phrase = parms.phrase ? parms.phrase : my.entry ? my.entry.text() : '';
	var search_definition = { 
		phrase : parms.phrase, result_types : my.result_types,
		order_by : my.order_by, order_reverse : my.order_reverse
	};
	if( !search_definition.phrase.length ) {
		$.extend( search_definition, my.empty_search );
	}
	var definition_changed = $.param(my.recent_search) != $.param(search_definition);
	if( definition_changed || !parms.discard_unchanged ) {
		var new_search_count = parms.search_count==my.search_count ? my.search_count : my.search_count+1;
		if( definition_changed ||  my.search_count != new_search_count ) {
			my.new_search_handler( {old_search: my.recent_search, new_search: search_definition,
									old_search_count: my.search_count, new_search_count: new_search_count} );
			my.recent_search = search_definition;
			my.search_count = new_search_count;
		}
		if( my.auto_search_timeout_obj ) window.clearTimeout( my.auto_search_timeout_obj );
		parms.range_offset = parms.range_offset ? parms.range_offset : 0;
		search_args = $.extend( {range_limit: my.range_limit, range_offset: parms.range_offset}, search_definition );
		search_args = $.extend( search_args, my.recursive )
		if( my.activity_bar ) {
			my.activity_bar.addClass( "active" );
		}
		get_module( 'search', {
			args : search_args,
			done : function(result) {
				result = parse_result( result );
				if( my.activity_bar ) {
					my.activity_bar.removeClass( "active" );
				}
				my.hide_apropos_hints();
				var bubble = true;
				if( parms.done ) bubble = parms.done( result ); // optional single search result handler
				if( bubble==undefined || bubble ) my.result_handler( result ); // generic searchbar result handler
			}
		} );
	}
};

SearchBar.prototype.clear = function( parms ) {
	var my = this;
	my.entry.empty();
	my.search();
};

SearchBar.prototype.show_apropos_hints = function() {
	var my = this;
	if( my.apropos_hints_enabled ) {
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
	}
};

SearchBar.prototype.select_apropos_hint = function() {};

SearchBar.prototype.hide_apropos_hints = function() {
	var my = this;
	if( my.apropos_hints ) my.apropos_hints.hide();
};

return SearchBar;
}); //define()
