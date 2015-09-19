var Minion = function( parms ) {
	var my = this;
	my.dom_object = parms.dom_object;
	my.obj = parms.obj;
	
	my.filter_include = function( event ) {
		global_search.entry.text( my.obj.data );
		global_search.search();
	}
	
	my.filter_exclude = function( event ) {
		var search_phrase = global_search.entry.text();
		if( search_phrase=='' ) search_phrase = 'type:entry';
		global_search.entry.text( search_phrase+' --'+my.obj.data );
		global_search.search();
	}
	
	my.fill_details = function() {
		my.details_title_input.val( my.obj.title );
		my.details_query_input.val( my.obj.data );
	}
	
	my.show_details = function( event ) {
		my.fill_details()
		my.details_dialog.show();
	};
	
	my.hide_details = function( event ) {
		my.details_dialog.hide();
	};
	
	my.save_details = function( event ) {
		get_module( "store", {
			args : {id : my.obj.id, title : my.details_title_input.val(), data : my.details_query_input.val()},
			done : function( result ) {
				result = parse_result( result );
				if( result.succeeded ) {
					get_module( "get", {
						args : {id : my.obj.id, view : "all"},
						done : function( result ) {
							result = parse_result( result );
							if( result[0] ) {
								var updt_obj = result[0];
								show_object( {obj : updt_obj, dom_parent : my.dom_parent} );
							}
						}
					});
				}
			}
		});
		my.hide_details();
	};
	
	my.delete = function( event ) {
		get_module( "delete", {
			args : {id : my.obj.id},
			done : function( result ) {
				result = parse_result( result );
				if( result.succeeded ) {
					$(my.dom_object).remove();
				}
			}
		});
	};
	
	my.title = $( ".minion-title", my.dom_object );
	my.filter_include_button = $( ".minion-filter-include", my.dom_object );
	my.filter_include_button.on( "click", my.filter_include );
	//$(my.dom_object).on( "click", my.filter_include );
	my.filter_exclude_button = $( ".minion-filter-exclude", my.dom_object );
	my.filter_exclude_button.on( "click", my.filter_exclude );
	my.details_button = $( ".minion-show-details", my.dom_object );
	my.details_button.on( "click", my.show_details );
	my.details_dialog = $( ".minion-details-dialog", my.dom_object );
	my.details_title_input = $( ".minion-details-title-input", my.details_dialog );
	my.details_query_input = $( ".minion-details-query-input", my.details_dialog );
	my.details_cancel_button = $( ".minion-details-cancel", my.details_dialog );
	my.details_cancel_button.on( "click", my.hide_details );
	my.details_save_button = $( ".minion-details-save", my.details_dialog );
	my.details_save_button.on( "click", my.save_details );
	my.delete_button = $( ".minion-delete", my.details_dialog );
	my.delete_button.on( "click", my.delete );
};

var Minions = function( parms ) {
	var my = this;
	my.dom_parent = parms.dom_parent;
	my.limit = parms.limit;
	
	my.add_drop_box = function( dom_parent, limit ) {
		my.upload_dialog = new UploadDialog( {
			dom_parent : my.dom_parent,
			accepted_types : ["^image/"],
			custom_class : "mini", 
			custom_callback : function( parms ) {
				var minion_obj = undefined;
				if( parms.source_obj ) {
					minion_obj = $(parms.source_obj.dom_object).closest(".ems-minion")[0];
				}
				if( !minion_obj ) {
					// Neues Minion anlegen:
					minion_obj = $('<div class="ems-minion"></div>')[0];
					$(parms.obj.dom_object).wrap( minion_obj );
					new_item( {obj:{type: "application/x-obj.minion"}, dom_object: minion_obj} );
					var minion_id = $(minion_obj).data().obj.id;
					get_module( "store", {
						args : {id : parms.obj.id, parent_id : minion_id},
						async : false,
						done : function( result ) {
							result = parse_result( result )
							if( result.succeeded ) {
								my.search.search();
							}
						}
					});
				} else {
					// Altes Minion durch mtime-Update nach vorn ziehen:
					var minion_id = $(minion_obj).data().obj.id;
					get_module( "store", {
						args : {id : minion_id},
						async : false,
						done : function( result ) {
							result = parse_result( result )
							if( result.succeeded ) {
								my.search.search();
							}
						}
					});
				}
			}
		}); 
	}
	
	my.search = new SearchBar( {
		result_handler : function( result ) {
			result.dom_parent = my.dom_parent;
			show_search_result( result );
		},
		result_types : 'application/x-obj.minion',
		empty_search : {phrase : 'type:minion', min_weight : "None"},
		order_by : 'mtime',
		order_reverse : 'true',
		range_limit : my.limit,
		recursive : {children: true, parents: false},
		new_search_handler : function( parms ) {
			my.dom_parent.empty();
			my.add_drop_box();
		},
		on_ready : function() {
			this.search();
		}
	} );
};