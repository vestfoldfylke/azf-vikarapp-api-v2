const { mongoDB } = require('../../../config')
const { logger } = require('@vtfk/logger')
const { getGroupOwners, getGroupMembers, removeGroupMember, removeGroupOwner, addGroupOwner, getAdditionalRequestorInfo } = require('../callGraph')
const { getMongoClient } = require('../mongoClient')
const createStats = require('./createStats')
const { logToDB } = require('./logToDB')

const deactivateSubstitutions = async (onlyFirst = false, substitutions, request, context) => {
  const logPrefix = 'deactivateSubstitutions - graphJobs.js'
  // Connect to the database
  const mongoClient = await getMongoClient()

  // If no substitutions were provided, the timetrigger was the one that called this function. Get the active substitutions from the database.
  if (!substitutions) {
    logger('info', [logPrefix, 'No substitutions provided. Get the active substitutions from the database'])
    const query = { status: 'active', expirationTimestamp: { $lte: new Date() } }
    try {
      substitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(query).toArray()
    } catch (error) {
      logger('error', [logPrefix, 'An error occured while trying to get the active substitutions', error])
      throw new Error('An error occured while trying to get the active substitutions')
    }
  }

  // Only deactivate the first substitution.
  if (onlyFirst && substitutions.length > 0) substitutions = [substitutions[0]]

  const responses = []
  const error = { errors: [] }
  const stats = []

  for (const substitution of substitutions) {
    try {
      if (!substitution.teamId) {
        logger('error', [logPrefix, `Substitution '${substitution._id}' missing teamId`])
        error.errors.push(new Error(`Substitution '${substitution._id}' missing teamId`))
        continue
      }
      if (!substitution.substituteId) {
        logger('error', [logPrefix, `Substitution '${substitution.substituteId}' missing substituteId`])
        error.errors.push(new Error(`Substitution '${substitution.substituteId}' missing substituteId`))
        continue
      }

      // Make sure that the substitute is already owner. Find owners and Members.
      logger('info', [logPrefix, 'Get the owners and members of the team'])
      const owners = await getGroupOwners(substitution.teamId)
      const members = await getGroupMembers(substitution.teamId)

      logger('info', [logPrefix, 'Check if the substitute is an owner or a member'])
      const currentOwner = owners.find((i) => i.id === substitution.substituteId)
      const currentMember = members.find((i) => i.id === substitution.substituteId)

      // If the substitute is an owner, remove the owner. If the substitute is a member, remove the member.
      logger('info', [logPrefix, 'Remove the substitute from the team if it is an owner or a member'])
      if (currentOwner || currentMember) {
        if (currentOwner) {
          // Remove the owner
          logger('info', [logPrefix, 'Remove the substitute as owner'])
          await removeGroupOwner(substitution.teamId, substitution.substituteId)
        }
        if (currentMember) {
          // Remove the member
          logger('info', [logPrefix, 'Remove the substitute as member'])
          await removeGroupMember(substitution.teamId, substitution.substituteId)
        }
        // Set the substitution status to 'expired'
        logger('info', [logPrefix, `Set the substitution: ${substitution._id} status to 'expired'`])
        const updatedSub = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).updateOne({ _id: substitution._id }, { $set: { status: 'expired' } })
        logger('info', [logPrefix, `Substitution: ${substitution._id} updated, status: 'expired'`])
        responses.push(updatedSub)
        stats.push({ teamId: substitution.teamId, status: 'expired', description: 'Substitute expired' })
      }
    } catch (error) {
      logger('error', [logPrefix, 'An error occured while trying to deactivate the substitution', error])
      // Log the error to the db
      await logToDB('error', error, request, context)
    }
  }
  // Create statistics for the deactivated substitutions
  logger('info', [logPrefix, 'Create statistics for the deactivated substitutions'])
  for (const stat of stats) {
    await createStats(stat)
  }

  // Log the substitutions to the db
  logger('info', [logPrefix, `Deactivated '${responses.length}' substitutions`])
  await logToDB('info', { message: `Deactivated '${responses.length}' substitutions`, substitutions: responses }, request, context)

  // Return the responses
  return responses
}

const activateSubstitutions = async (onlyFirst = false, request, context) => {
  const logPrefix = 'activateSubstitutions - graphJobs.js'
  // Connect to the database
  const mongoClient = await getMongoClient()

  // Define the query
  const query = { status: 'pending' }

  // Get the pending substitutions from the database
  let pendingSubstitutions = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).find(query).toArray()

  if (!pendingSubstitutions || pendingSubstitutions.length === 0) {
    logger('info', [logPrefix, 'No pending substitutions found'])
    return
  }

  // If onlyFirst is true, only activate the first substitution
  if (onlyFirst && pendingSubstitutions.length > 0) {
    logger('info', [logPrefix, 'onlyFirst is true. Only activate the first substitution'])
    pendingSubstitutions = [pendingSubstitutions[0]]
  }

  // Holds the responses and errors
  const responses = []
  // Holds the statistics
  const stats = []

  // Loop through the pending substitutions and activate them.
  /* eslint no-unreachable-loop: ["error", { "ignore": ["ForOfStatement"] }] */
  for (const substition of pendingSubstitutions) {
    try {
      if (!substition.teamId) {
        logger('error', [logPrefix, `Substitution '${substition._id}' missing teamId`])
        throw new Error(`Substitution '${substition._id}' missing teamId`)
      }
      if (!substition.substituteId) {
        logger('error', [logPrefix, `Substitution '${substition._id}' missing substituteId`])
        throw new Error(`Substitution '${substition._id}' missing substituteId`)
      }

      // Add the substitute as owner to the team
      logger('info', [logPrefix, 'Add the substitute as owner to the team'])
      await addGroupOwner(substition.teamId, substition.substituteId)

      // Set the substitution status to 'active'
      const updatedSub = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).updateOne({ _id: substition._id }, { status: 'active', updatedTimestamp: new Date() }, { new: true })
      responses.push(updatedSub)
      stats.push({ teamId: substition.teamId, status: 'active', description: 'Substitute activated' })
    } catch (error) {
      logger('error', [logPrefix, 'An error occured while trying to activate the substitution', error])
      await logToDB('error', error, request, context)
    }

    await logToDB('info', { message: `Activated '${responses.length}' substitutions`, substitutions: responses }, request, context)
    // Create statistics for the activated substitutions
    for (const stat of stats) {
      await createStats(stat)
    }

    // Return the responses
    return responses
  }
}

const getEmplyeeInfo = async (requestor) => {
  const logPrefix = 'getEmplyeeInfo'
  const info = await getAdditionalRequestorInfo(requestor)

  // Validate that the returned object has the required properties
  if (!info.jobTitle || !info.department || !info.officeLocation || !info.company) {
    logger('error', [logPrefix, 'Missing required properties in the returned object'])
    throw new Error('Missing required properties in the returned object')
  }

  // Return the info
  return info
}

module.exports = {
  deactivateSubstitutions,
  activateSubstitutions,
  getEmplyeeInfo
}
