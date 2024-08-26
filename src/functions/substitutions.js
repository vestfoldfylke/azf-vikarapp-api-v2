const { app } = require('@azure/functions')
const { logger } = require('@vtfk/logger')
const { getMongoClient } = require('../lib/mongoClient')
const { logToDB } = require('../lib/jobs/logToDB')
const { getUser, getOwnedObjects } = require('../lib/callGraph')
const { getPermittedLocations } = require('../lib/jobs/getPermittedLocations')
const { activateSubstitutions, deactivateSubstitutions } = require('../lib/jobs/graphJobs')
const { prepareRequest } = require('../lib/auth/requestor')
const { mongoDB } = require('../../config')
const { ObjectId } = require('mongodb')

app.http('substitutions', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  route: 'substitutions',
  handler: async (request, context) => {
    let logPrefix = 'substitutions - validate'
    const { requestor } = await prepareRequest(request)
    let requestBody
    // Make sure all the required properties are provided

    // Validate the POST request body
    if (request.method === 'POST') {
      // Make sure the request.body is an array
      requestBody = await request.json()
      if (!Array.isArray(requestBody)) {
        logger('error', [logPrefix, 'The body must be an array'])
        throw new Error('The body must be an array')
      }

      // Make sure all the required properties are provided
      logger('info', [logPrefix, 'Make sure all the required properties are provided'])
      for (const substitution of requestBody) {
        // The requestor must be admin (App.Admin)
        if (!requestor.roles.includes('App.Admin') && requestor.upn !== substitution.substituteUpn) {
          logger('warn', [logPrefix, 'Unauthorized. The requestor does not have the required role to perform this action.', `Requestor: ${requestor.name} (${requestor.id})`, `Roles: ${requestor.roles.join(', ')}`])
          throw new Error('Unauthorized. You do not have the required role to perform this action.')
        }
        if (!substitution.substituteUpn) {
          logger('error', [logPrefix, 'One or more substitution request is missing \'substituteUpn\''])
          throw new Error('One or more substitution requests are missing \'substituteUpn\'')
        }
        if (!substitution.substituteUpn.includes('@')) {
          logger('error', [logPrefix, `${substitution.substituteUpn} is not a valid upn`])
          throw new Error(`${substitution.substituteUpn} is not a valid upn`)
        }
        if (!substitution.teacherUpn) {
          logger('error', [logPrefix, 'One or more substitution request is missing \'teacherUpn\''])
          throw new Error('One or more substitution requests are missing \'teacherUpn\'')
        }
        if (!substitution.teacherUpn.includes('@')) {
          logger('error', [logPrefix, `${substitution.teacherUpn} is not a valid upn`])
          throw new Error(`${substitution.teacherUpn} is not a valid upn`)
        }
        if (!substitution.teamId) {
          logger('error', [logPrefix, 'Substitution request is missing \'teamId\''])
          throw new Error('One or more substitution requests are missing \'teamId\'')
        }
        if (substitution.substituteUpn.toLowerCase() === substitution.teacherUpn.toLowerCase()) {
          logger('error', [logPrefix, `The substitute and the teacher cannot be the same person, ${substitution.substituteUpn} and ${substitution.teacherUpn}`])
          throw new Error(`The substitute and the teacher cannot be the same person, ${substitution.substituteUpn} and ${substitution.teacherUpn}`)
        }
      }
    }

    // Validate the PUT request body
    if (request.method === 'PUT') {
      // Check if the a body is provided
      if (!request.json()) {
        logger('error', [logPrefix, 'No body provided'])
        throw new Error('No body provided')
      }
      // Make sure the request.json() is an array
      if (!Array.isArray(request.json())) {
        logger('error', [logPrefix, 'The body must be an array'])
        throw new Error('The body must be an array')
      }
      // Make sure the requestor has the correct role (App.Config)
      if (!requestor.roles.includes('App.Config')) {
        logger('warn', [logPrefix, 'Unauthorized. The requestor does not have the required role to perform this action.', `Requestor: ${requestor.name} (${requestor.id})`, `Roles: ${requestor.roles.join(', ')}`])
        throw new Error('Unauthorized. You do not have the required role to perform this action.')
      }
      // Validate that the ids provided in the body are of type string
      request.json().forEach(id => {
        if (typeof id !== 'string') {
          logger('warn', [logPrefix, `The id '${id}' is not of type 'string'`])
          throw new Error(`The id '${id}' is not of type 'string'`)
        }
      })
    }

    // Connect to the database
    const mongoClient = await getMongoClient()

    // Determine the method and handle the request
    if (request.method === 'GET') {
      logPrefix = 'substitutions - get'
      // Get the query parameters
      const status = request.query?.get('status')
      const teacherUpn = request.query?.get('teacherUpn')
      const substituteUpn = request.query?.get('substituteUpn')
      let years = request.query?.get('years')

      // Clean up the years query parameter
      if (years && years.includes(',')) years = years.split(',')
      if (years && !Array.isArray(years)) years = [years]

      // If the requestor is not admin, make sure that it has permissions for the call
      if (!requestor.roles.includes('App.Admin')) {
        if (!substituteUpn && !teacherUpn) {
          logger('warn', [logPrefix, 'Unauthorized. The requestor does not have the required role to perform this action.', `Requestor: ${requestor.name} (${requestor.id})`, `Roles: ${requestor.roles.join(', ')}`])
          throw new Error('Unauthorized. You do not have the required role to perform this action.')
        }
        if (substituteUpn !== requestor.upn && teacherUpn !== requestor.upn) {
          logger('warn', [logPrefix, 'Unauthorized. The requestor does not have the required role to perform this action.', `Requestor: ${requestor.name} (${requestor.id})`, `Roles: ${requestor.roles.join(', ')}`])
          throw new Error('Unauthorized. You do not have the required role to perform this action.')
        }
      }

      // Define the filter
      logger('info', [logPrefix, 'Define the filter'])
      let filter = []
      if (status) filter.push({ status })
      if (teacherUpn) filter.push({ teacherUpn })
      if (substituteUpn) filter.push({ substituteUpn })
      if (years && years.length > 0) {
        const $or = []
        years.forEach((i) => {
          const firstTimestamp = new Date(i, 0, 1, 1)
          const lastTimestamp = new Date(i, 12, 31, 25)
          $or.push({
            createdTimestamp: {
              $gt: firstTimestamp,
              $lt: lastTimestamp
            }
          })
        })
        filter.push({ $or })
      }

      // If the filter is empty, set it to an empty object. If not, set it to an $and object
      filter.length > 0 ? filter = { $and: [...filter] } : filter = {}

      // Query the database
      let substitutions
      try {
        logger('info', [logPrefix, 'Query the database'])
        substitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(filter).sort({ expirationTimestamp: -1 }).toArray()
        logger('info', [logPrefix, `Found ${substitutions.length} substitutions`])
      } catch (error) {
        logger('error', [logPrefix, 'An error occured while trying to get the substitutions', error])
        await logToDB('error', error, request, context, requestor)
      }

      // Return the substitutions
      return { status: 200, jsonBody: substitutions }
    } else if (request.method === 'POST') {
      logPrefix = 'substitutions - post'
      // Get all the unique substitutions and the teacher UPNS from the request body
      const uniqueSubstituteUpns = [...new Set(requestBody.map(i => i.substituteUpn))]
      const uniqueTeacherUpns = [...new Set(requestBody.map(i => i.teacherUpn))]

      // Get all the required substitue informastion from ms graph
      const substitutes = []
      for (const upn of uniqueSubstituteUpns) {
        // Get the substitute from ms graph
        const substitute = await getUser(upn)
        if (!substitute) {
          logger('error', [logPrefix, `Could not find the substitute with upn ${upn}`])
          throw new Error(`Could not find the substitute with upn ${upn}`)
        }

        // Attempt to find the exisitng substitutions in the database
        const existingSubstitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find({ substituteId: substitute.id })
        if (existingSubstitutions) {
          substitute.substitutions = existingSubstitutions
        }

        // Check if the substitute is admin. If not, get the substitutes permittedLocations
        console.log(requestor.roles)
        if (!requestor.roles.includes('App.Admin')) {
          logger('info', [logPrefix, `Check if the substitute ${upn} has the required permissions to substitute for the teacher`])
          // console.log(substitute.permittedLocations)
          substitute.permittedLocations = await getPermittedLocations(substitute.companyName)
          if (!substitute.permittedLocations || !Array.isArray(substitute.permittedLocations) || substitute.permittedLocations.length === 0) {
            logger('error', [logPrefix, `Substitute ${upn} does not have any permitted locations`])
            throw new Error(`Substitute ${upn} does not have any permitted locations`)
          }
        }

        substitutes.push(substitute)
      }

      // Get all the required teacher information from ms graph
      const teachers = []
      for (const upn of uniqueTeacherUpns) {
        // Get the teacher from ms graph
        const teacher = await getUser(upn)
        if (!teacher || !teacher.id) {
          logger('error', [logPrefix, `Could not find the teacher with upn ${upn}`])
          throw new Error(`Could not find the teacher with upn ${upn}`)
        }

        // Find all the owned objects for the teacher
        let ownedResources = await getOwnedObjects(upn)
        if (!ownedResources) {
          logger('error', [logPrefix, `Could not find any owned resources for teacher ${upn}`])
          throw new Error(`Could not find any owned resources for teacher ${upn}`)
        }

        // If the ownedResoruces contains a value property, set it to the value.
        if (ownedResources.value) {
          ownedResources = ownedResources.value
        }

        teacher.owned = ownedResources
        teachers.push(teacher)
      }

      // Create the database entry for creating/renewing the substitutions
      const expirationTimestamp = new Date(new Date().setHours(1, 0, 0, 0) + (3 * 24 * 60 * 60 * 1000)) // 2 days from now, at 01:00.
      const newSubstitutions = [] // The new substitutions to be created
      const renewedSubstitutions = [] // The substitutions that are extended from active
      const renewedExpiredSubstitutions = [] // The substitutions that are renewed from expired
      try {
        // Loop through the request body
        /* eslint no-unreachable-loop: ["error", { "ignore": ["ForOfStatement"] }] */
        for (const substitution of requestBody) {
          let newSubstitutionsObj = {
            _id: '',
            status: 'pending',
            teacherId: '',
            teacherName: '',
            teacherUpn: '',
            substituteId: '',
            substituteName: '',
            substituteUpn: '',
            teamId: '',
            teamName: '',
            teamEmail: '',
            teamSdsId: '',
            substitutionUpdated: 0,
            expirationTimestamp: '',
            createdTimestamp: new Date(),
          }

          // Get the substitute and teacher
          const substitute = substitutes.find(i => i.userPrincipalName === substitution.substituteUpn)
          const teacher = teachers.find(i => i.userPrincipalName === substitution.teacherUpn)

          // Make sure that the substitute has the required permissions to substitute for the teacher
          logger('info', [logPrefix, `Make sure that the substitute ${substitute.userPrincipalName} has the required permissions to substitute for ${teacher.userPrincipalName}`])
          if (!requestor.roles.includes('App.Admin')) {
            logger('info', [logPrefix, `Check if the substitute ${substitute.userPrincipalName} has the required permissions to substitute for ${teacher.userPrincipalName}`])
            if (!Array.isArray(substitute.permittedLocations) || substitute.permittedLocations.length === 0) {
              logger('error', [logPrefix, `Was not able to determine if the substitute ${substitute.userPrincipalName} has the required permissions to substitute for ${teacher.userPrincipalName}`])
              throw new Error(`Was not able to determine if the substitute ${substitute.userPrincipalName} has the required permissions to substitute for ${teacher.userPrincipalName}`)
            }

            // Find the permitted locations for the substitute
            logger('info', [logPrefix, `Find the permitted locations for the substitute ${substitute.userPrincipalName}`])
            const permittedSchoolNames = substitute.permittedLocations.map(i => i.name)
            if (!permittedSchoolNames.includes(teacher.companyName)) {
              logger('error', [logPrefix, `The substitute ${substitute.userPrincipalName} does not have the required permissions to substitute for ${teacher.userPrincipalName}`])
              throw new Error(`The substitute ${substitute.userPrincipalName} does not have the required permissions to substitute for ${teacher.userPrincipalName}`)
            }
          }

          // Verify that the teacher owns the requested team and that it is valid for substitution
          logger('info', [logPrefix, `Verify that the teacher ${teacher.userPrincipalName} owns the requested team and that it is valid for substitution`])
          const team = teacher.owned?.find(i => i.id === substitution.teamId)
          if (!team) {
            logger('error', [logPrefix, `The teacher ${teacher.userPrincipalName} does not own the requested team ${substitution.teamId}`])
            throw new Error(`The teacher ${teacher.userPrincipalName} does not own the requested team ${substitution.teamId}`)
          }
          if (!team['@odata.type'] || team['@odata.type'].toLowerCase() !== '#microsoft.graph.group') {
            logger('error', [logPrefix, `The requested team ${substitution.teamId} is not a valid team`])
            throw new Error(`The requested team ${substitution.teamId} is not a valid team`)
          }
          if (!team.mail || !team.mail.toLowerCase().startsWith('section_')) {
            logger('error', [logPrefix, `The requested team ${substitution.teamId} is not a school team`])
            throw new Error(`The requested team ${substitution.teamId} is not a school team`)
          }

          // Check if the substition is currently active and should be renewed, else create a new substitution
          logger('info', [logPrefix, 'Check if the substition is currently active and should only be renewed else create a new substitution'])
          if (substitution.status === 'active') {
            logger('info', [logPrefix, 'The substitution is currently active and should be renewed'])
            renewedSubstitutions.push({
              extendedSubstitution: {...substitution},
              _id: substitution._id, // Document ID from mongoDB
              expirationTimestamp
            })
          } else if (substitution.status === 'expired') {
            logger('info', [logPrefix, 'The substitution is currently expired and should be renewed'])
            renewedExpiredSubstitutions.push({
              expiredSubstitution: {...substitution},
              _id: substitution._id, // Document ID from mongoDB
              expirationTimestamp,
            })
          } else {
            // If we enable School data sync, we can get the school id from the team mail. Unusable for now.
            let teamSdsId = team.mail
            if (teamSdsId.includes('_')) {
              teamSdsId = teamSdsId.substring(teamSdsId.indexOf('_') + 1)
            }

            // Create the new substitution
            logger('info', [logPrefix, 'Create the new substitution'])
            // Create the new substitution object
            newSubstitutionsObj._id = new ObjectId()
            newSubstitutionsObj.teacherId = teacher.id
            newSubstitutionsObj.teacherName = teacher.displayName
            newSubstitutionsObj.teacherUpn = teacher.userPrincipalName
            newSubstitutionsObj.substituteId = substitute.id
            newSubstitutionsObj.substituteName = substitute.displayName
            newSubstitutionsObj.substituteUpn = substitute.userPrincipalName
            newSubstitutionsObj.teamId = team.id
            newSubstitutionsObj.teamName = team.displayName
            newSubstitutionsObj.teamEmail = team.mail
            newSubstitutionsObj.teamSdsId = teamSdsId
            newSubstitutionsObj.expirationTimestamp = expirationTimestamp

            newSubstitutions.push(newSubstitutionsObj)
          }
        }
        
        // Make the request to the database
        let documents = [] // The documents to be returned
        if (newSubstitutions.length > 0) {
          for (const newSubstitution of newSubstitutions) {
            try {
              // Insert the new substitutions
              logger('info', [logPrefix, 'Insert the new substitutions'])
              const result = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).insertOne(newSubstitution)
              documents.push(result)
              try {
                // Make the request to activate the substitutions in the database
                await activateSubstitutions(false, request, context)
                await logToDB('info', newSubstitution, request, context, requestor)
              } catch (error) {
                logger('error', [logPrefix, 'An error occured while trying to activate the substitutions or create logentry in the database', error])
                await logToDB('error', error, request, context, requestor)
                return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error })}
              }
            } catch (error) {
              logger('error', [logPrefix, 'An error occured while trying to Insert the new substitutions into the DB', error])
              await logToDB('error', error, request, context, requestor)
              return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error }) } 
            }
          }
        }
        // Update the renewed substitutions
        for (const renewal of renewedSubstitutions) {
          try {
            // Update the renewed substitutions
            logger('info', [logPrefix, 'Update the renewed substitutions expirationTimestamp'])
            const result = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).updateOne({ _id: new ObjectId(renewal._id) }, { $set: { expirationTimestamp: renewal.expirationTimestamp, updatedTimestamp: new Date()}, $inc: { substitutionUpdated: 1 } })
            documents = [...documents, result]

            try {
              // Logg action to the database
              await logToDB('info', renewal, request, context, requestor)
            } catch (error) {
              logger('error', [logPrefix, 'An error occured while trying to activate the substitutions or create logentry in the database', error])
              await logToDB('error', error, request, context, requestor)
              return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error })}
            }
          } catch (error) {
            logger('error', [logPrefix, 'An error occured while trying to Update the renewed substitutions in the DB', error])
            await logToDB('error', error, request, context, requestor)
            return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error })} 
          }
        }

        // Update the renewed substitutions
        for (const renewal of renewedExpiredSubstitutions) {
          try {
            // Update the renewed substitutions
            logger('info', [logPrefix, 'Update the expired substitutions to pending'])
            const result = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).updateOne({ _id: new ObjectId(renewal._id) }, { $set: { expirationTimestamp: renewal.expirationTimestamp, updatedTimestamp: new Date(), status: 'pending' }, $inc: { substitutionUpdated: 1 } })
            documents = [...documents, result]
            try {
              // Make the request to activate the substitutions in the database
              await activateSubstitutions(false, request, context)
              await logToDB('info', renewal, request, context, requestor)
            } catch (error) {
              logger('error', [logPrefix, 'An error occured while trying to activate the substitutions or create logentry in the database', error])
              await logToDB('error', error, request, context, requestor)
              return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error })}
            }
          } catch (error) {
            logger('error', [logPrefix, 'An error occured while trying to Update the renewed substitutions in the DB', error])
            await logToDB('error', error, request, context, requestor)
            return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error })} 
          }
        }
  
        // Return the documents
        return { status: 201, jsonBody: documents }
      } catch (error) {
        logger('error', [logPrefix, 'An error occured while trying to create the substitutions', error])
        await logToDB('error', error, request, context, requestor)
        return { status: 404, jsonBody: JSON.stringify({ error: error?.message || error })}
      }
    } else if (request.method === 'PUT') {
      // Remember to change the endpoint in the front end from substitutions/deactivate to substitutions!
      logPrefix = 'substitutions - put'

      let substitutions
      let response

      try {
        // Retrive all the ids from the body
        const ids = request.body.filter((id) => id)
        if (ids.length === 0) {
          logger('warn', [logPrefix, 'No ids provided'])
          throw new Error('No ids provided')
        }

        // Get the substitutions from the ids
        logger('info', [logPrefix, 'Get the substitutions from the ids'])
        substitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find({ _id: { $in: ids } }).toArray()

        // Check if any substitutions were found
        if (substitutions.length === 0) {
          logger('warn', [logPrefix, 'No substitutions found'])
          throw new Error('No substitutions found')
        }
        logger('info', [logPrefix, `Found ${substitutions.length} substitutions`])

        // Deactivate the substitutions
        logger('info', [logPrefix, 'Try to deactivate the substitutions'])
        response = await deactivateSubstitutions(undefined, substitutions, request, context)

        // Return the deactivated substitutions
        logger('info', [logPrefix, 'Return the deactivated substitutions'])
        return { status: 201, jsonBody: response }
      } catch (error) {
        logger('error', [logPrefix, 'An error occured while trying to deactivate the substitutions', error?.message || error])
        await logToDB('error', error, request, context, requestor)
        return { status: 500, jsonBody: { error: error?.message || error } }
      }
    }
  }
})
