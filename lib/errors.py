class PrivilegeError( Exception ):
	def __init__( self, msg="Insufficient privileges" ):
		super().__init__( msg )

class AuthenticationNeeded( PrivilegeError ):
	def __init__( self, msg="You need to authenticate yourself" ):
		super().__init__( msg )

class ParameterError( Exception ):
	def __init__( self, msg="Missing or invalid request parameters" ):
		super().__init__( msg )

