var Minions = {
	show_latest : function( dom_parent, limit ) {
		if( !dom_parent ) {
			show_error( "Minions-Container undefined ("+String(dom_parent)+")" );
			return;
		}
		$(dom_parent).empty();
		load_visible_objects( {type: 'application/x-obj.minion', dom_parent: dom_parent} );
		add_file( {dom_parent:dom_parent, custom_class:"mini", 
		custom_callback: function( parms ) {
			$(parms.obj.dom_object).wrap('<span class="ems-minion"></span>')
			var minion_obj = parms.obj.dom_object.parentNode;
			new_item( {obj:{type: "application/x-obj.minion"}, dom_object: minion_obj} );
			var minion_id = $(minion_obj).data().obj.id;
			$.ajax({
					url : "ems.wsgi?do=store&id="+parms.obj.id+"&parent_id="+String(minion_id),
					type : "GET",
					async : false, /* hier, ohne komplizierteres Event-Hanlding, wichtig zur Vermeidung von Race-Conditions */
					success :
				function( result ) {
					result = parse_result( result )
					if( result.succeeded ) {
						Minions.show_latest( dom_parent, limit );
					}
				}
			})
		}}); 
	}
};