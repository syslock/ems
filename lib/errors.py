class PrivilegeError( Exception ):
	def __init__( self, msg="Insufficient privileges" ):
		super().__init__( msg )

class AuthenticationNeeded( PrivilegeError ):
	def __init__( self, msg="You need to authenticate yourself" ):
		super().__init__( msg )

class ParameterError( Exception ):
	def __init__( self, msg="Missing or invalid request parameters" ):
		super().__init__( msg )

class ObjectError( Exception ):
	def __init__( self, msg="Object inconistent" ):
		super().__init__( msg )

class StateError( Exception ):
	def __init__( self, msg="An internal sanity check failed, something went wrong" ):
		super().__init__( msg )

class InternalProgramError( Exception ):
	def __init__( self, msg="The program encountered an internal error, that is propably caused by a bug in the code" ):
		super().__init__( msg )
