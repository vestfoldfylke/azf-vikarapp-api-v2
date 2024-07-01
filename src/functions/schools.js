const { app } = require('@azure/functions')
const { mongoDB } = require('../../config')
const { logger } = require('@vtfk/logger')
const { getMongoClient } = require('../lib/mongoClient')
const { logToDB } = require('../lib/jobs/logToDB')
const { prepareRequest } = require('../lib/auth/requestor')
const { ObjectId } = require('mongodb')

app.http('schools', {
  methods: ['GET', 'POST', 'PUT'],
  authLevel: 'anonymous',
  route: 'schools/{id?}', // id is optional, make sure to check if it is provided
  handler: async (request, context) => {
    let logPrefix = 'schools'
    let requestor
    // Make sure all the required properties are provided
    ({ requestor } = await prepareRequest(request))

    const requestBody = await request.text()
    // Make sure the requestor has the correct role (App.Config)
    if (!requestor.roles?.includes('App.Config')) {
      logger('warn', [logPrefix, 'Unauthorized. The requestor does not have the required role to perform this action.', `Requestor: ${requestor.name} (${requestor.id})`, `Roles: ${requestor.roles?.join(', ')}`])
      throw new Error('Unauthorized. You do not have the required role to perform this action.')
    }

    // Connect to the database
    const mongoClient = await getMongoClient()

    // Determine the method
    if (request.method === 'GET') {
      // Get the schools
      let schools
      logPrefix = 'schools - get'

      try {
        logger('info', [logPrefix, 'Get the schools'])
        schools = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).find().sort({ name: 1 }).toArray()
        logger('info', [logPrefix, `Found ${schools.length} schools`])
      } catch (error) {
        logger('error', [logPrefix, 'An error occured while trying to get the schools', error])
        await logToDB('error', error, request, context, requestor)
      }

      // // Return the schools
      return { status: 200, jsonBody: schools }
    } else if (request.method === 'POST') {
      let school
      logPrefix = 'schools - post'

      // Post the school to the database from request.body
      try {
        logger('info', [logPrefix, 'Post the school to the database'])
        school = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).insertOne(JSON.parse(requestBody))
        logger('info', [logPrefix, `School posted to the database with id ${school.insertedId}`])
        await logToDB('info', school, request, context, requestor)
      } catch (error) {
        logger('error', [logPrefix, 'An error occured while trying to post the school to the database', error])
        await logToDB('error', error, request, context, requestor)
      }

      // Return the school posted to the database
      return { status: 201, jsonBody: school }
    } else if (request.method === 'PUT') {
      // Update the school with the provided id
      let school
      logPrefix = 'schools - put'

      // Make sure the id is provided
      if (!request.params.id) {
        logger('warn', [logPrefix, 'No id provided'])
        throw new Error('No id provided')
      }
      try {
        logger('info', [logPrefix, 'Update the school with the provided id'])
        console.log('requestBody', ((requestBody)))
        // Find the document with the provided ._id and update the permittedSchools array in the document
        console.log(request.params.id)
        school = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SCHOOLS_COLLECTION).updateOne({ _id: new ObjectId(request.params.id) }, { $set: { permittedSchools: JSON.parse(requestBody) } }, { returnDocument: 'after' })
        console.log('school', school)
        logger('info', [logPrefix, `School updated with id ${request.params.id}`])
        await logToDB('info', school, request, context, requestor)
      } catch (error) {
        logger('error', [logPrefix, 'An error occured while trying to update the school', error])
        await logToDB('error', error, request, context, requestor)
      }

      // Return the updated school
      return { status: 200, jsonBody: school }
    }
  }
})
