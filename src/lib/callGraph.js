const axios = require('axios').default
const getAccessToken = require('./auth/get-endtraid-token')
const { azureApplication } = require('../../config')

const getUser = async (upn) => {
  // Input validation
  if (!upn) throw new Error('Cannot search for a user if \'upn\' is not specified')

  // Prepare the request
  const request = {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`
    },
    url: `https://graph.microsoft.com/v1.0/users/${upn}?$select=id,displayName,givenName,surname,userPrincipalName,companyName,officeLocation,preferredLanguage,mail,jobTitle,mobilePhone,businessPhones`
  }

  // Make the request and normalize the data
  let { data } = await axios.request(request)
  if (data?.value) data = data.value

  return data
}

const searchUsersInGroup = async (searchTerm, groupId, requestor, returnSelf) => {
  // Input validation
  if (!searchTerm) throw new Error('Cannot search for a user if \'searchTerm\' is not specified')
  if (!groupId) throw new Error('Cannot search for a user if \'groupId\' is not specified')
  if (!requestor) throw new Error('Cannot search for a user if \'requestor\' is not specified')

  // Prepare the request
  const request = {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/groups/${groupId}/members?$search="displayName:${searchTerm}"&$select=id,displayName,jobTitle,officeLocation,userPrincipalName,companyName&$orderby=displayName`
  }

  // Make the request and normalize the data
  let { data } = await axios.request(request)
  if (data?.value) data = data.value

  // If not should not return self
  console.log(data)
  if (!returnSelf) data = data.filter((i) => i.userPrincipalName !== requestor.upn)

  return data
}

const getOwnedObjects = async (upn) => {
  // Input validation
  if (!upn) throw new Error('Cannot search for a user if \'upn\' is not specified')

  // Prepare the request
  const request = {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/users/${upn}/ownedObjects?$select=id,displayName,mail,description`
  }

  // Make the request and normalize the data
  let { data } = await axios.request(request)
  if (data?.value) data = data.value

  return data
}

const getGroups = async (id) => {
  // Input validation
  if (!id) throw new Error('Cannot search for a user if \'id\' is not specified')

  // Prepare the request
  const request = {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/groups/${id}`
  }

  // Make the request and normalize the data
  let { data } = await axios.request(request)
  if (data?.value) data = data.value

  return data
}

const getGroupOwners = async (id) => {
  // Input validation
  if (!id) throw new Error('Cannot search for a user if \'id\' is not specified')

  // Prepare the request
  const request = {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/groups/${id}/owners`
  }

  // Make the request and normalize the data
  let { data } = await axios.request(request)
  if (data?.value) data = data.value

  return data
}

const getGroupMembers = async (id) => {
  // Input validation
  if (!id) throw new Error('Cannot search for a user if \'id\' is not specified')

  // Prepare the request
  const request = {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/groups/${id}/members`
  }

  // Make the request and normalize the data
  let { data } = await axios.request(request)
  if (data?.value) data = data.value

  return data
}

const addGroupOwner = async (groupId, userId) => {
  // Input validation
  if (!groupId) throw new Error('Cannot search for a user if \'groupId\' is not specified')
  if (!userId) throw new Error('Cannot search for a user if \'userId\' is not specified')

  // Check if the user exists
  const user = await getUser(userId)
  if (!user) throw new Error(`The user with id '${userId} could not be found'`)

  // Check if the team exists and get its members
  let owners = []
  try {
    owners = await getGroupOwners(groupId)
    if (!owners) throw new Error(`The team '${groupId}' could not be found`)
  } catch { throw new Error(`The team '${groupId}' could not be found`) }

  // Check if the user is already a owner
  const existing = owners.find((i) => i.id === userId)
  if (existing) return { message: 'The user is already a owner' }

  // Prepare the request
  const request = {
    method: 'post',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/groups/${groupId}/owners/$ref`,
    data: {
      '@odata.id': `https://graph.microsoft.com/v1.0/users/${userId}`
    }
  }

  // Make the request
  const { data } = await axios.request(request)
  console.log(data)
  return data
}

const removeGroupOwner = async (groupId, userId) => {
  // Input validation
  if (!groupId) throw new Error('Cannot search for a user if \'groupId\' is not specified')
  if (!userId) throw new Error('Cannot search for a user if \'userId\' is not specified')

  // Prepare the request
  const request = {
    method: 'delete',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/groups/${groupId}/owners/${userId}/$ref`
  }

  // Make the request
  const { data } = await axios.request(request)

  return data
}

const removeGroupMember = async (groupId, userId) => {
  // Input validation
  if (!groupId) throw new Error('Cannot search for a user if \'groupId\' is not specified')
  if (!userId) throw new Error('Cannot search for a user if \'userId\' is not specified')

  // Prepare the request
  const request = {
    method: 'delete',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`,
      ConsistencyLevel: 'eventual'
    },
    url: `https://graph.microsoft.com/v1.0/groups/${groupId}/members/${userId}/$ref`
  }

  // Make the request
  const { data } = await axios.request(request)

  return data
}

const getAdditionalRequestorInfo = async (requestor) => {
  // Input validation
  if (!requestor) throw new Error('Cannot search for a user if \'requestor\' is not specified')

  // Prepare the request
  const request = {
    method: 'get',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await getAccessToken(azureApplication.scope)}`
    },
    url: `https://graph.microsoft.com/v1.0/users/${requestor.upn}?$select=jobTitle,department,officeLocation,companyName`
  }

  // Make the request and normalize the data
  let { data } = await axios.request(request)
  if (data?.value) data = data.value

  return data
}

module.exports = {
  getUser,
  searchUsersInGroup,
  getOwnedObjects,
  getGroups,
  getGroupOwners,
  getGroupMembers,
  addGroupOwner,
  removeGroupOwner,
  removeGroupMember,
  getAdditionalRequestorInfo
}
