const { logger } = require('@vtfk/logger')
const { getMongoClient } = require('./mongoClient')
const { mongoDB } = require('../../config')
const removeSubstitution = async (id) => {
  if (!id) {
    logger('error', ['removeSubstitution', 'Cannot remove a substitution if \'id\' is not specified'])
    throw new Error('Cannot remove a substitution if \'id\' is not specified')
  }

  // Connect to the database
  const mongoClient = await getMongoClient()

  // Remove the substitution from the database
  try {
    const result = await mongoClient.db(mongoDB.DB_NAME).collection(mongoDB.SUBSTITUTIONS_COLLECTION).deleteOne({ _id: id })
    if (result.deletedCount === 0) {
      logger('error', ['removeSubstitution', `No substitution found with id '${id}'`])
      throw new Error(`No substitution found with id '${id}'`)
    }

    logger('info', ['removeSubstitution', `Successfully removed ${result.deletedCount} substitutions with id '${id}'`])
  } catch (error) {
    logger('error', ['removeSubstitution', 'An error occured while trying to remove the substitution', error?.message || JSON.stringify(error)])
    throw error
  }
}

module.exports = {
  removeSubstitution
}
