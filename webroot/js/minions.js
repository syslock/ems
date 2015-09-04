var Minions = function( parms ) {
	my = this;
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