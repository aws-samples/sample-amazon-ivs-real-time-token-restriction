// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0

const jwt = require("jsonwebtoken");
const { SecretsManagerClient, GetSecretValueCommand } = require("@aws-sdk/client-secrets-manager");
const { IVSRealTimeClient, GetStageCommand } = require("@aws-sdk/client-ivs-realtime");
const crypto = require("crypto");

const stageArn = process.env.STAGE_ARN;
const publicKeyArn = process.env.PUBLIC_KEY_ARN;
const secretName = process.env.SECRET_NAME || "ivs-realtime-private-key";
const region = process.env.AWS_REGION || "us-east-1";

const secretsClient = new SecretsManagerClient({ region });
const ivsClient = new IVSRealTimeClient({ region });

// Cache the private key and stage info to avoid fetching on every invocation
let cachedPrivateKey = null;
let cachedStageInfo = null;

async function getPrivateKey() {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  try {
    const response = await secretsClient.send(
      new GetSecretValueCommand({
        SecretId: secretName,
      })
    );

    cachedPrivateKey = response.SecretString;
    return cachedPrivateKey;
  } catch (error) {
    console.error('Error fetching secret:', error);
    throw new Error('Failed to retrieve private key from Secrets Manager');
  }
}

async function getStageInfo() {
  if (cachedStageInfo) {
    return cachedStageInfo;
  }

  try {
    const response = await ivsClient.send(
      new GetStageCommand({
        arn: stageArn,
      })
    );

    // Extract stage ID from ARN (last part after the last /)
    const stageId = stageArn.split('/').pop();

    cachedStageInfo = {
      stageId: stageId,
      eventsUrl: response.stage.endpoints.events,
      whipUrl: response.stage.endpoints.whip,
    };

    return cachedStageInfo;
  } catch (error) {
    console.error('Error fetching stage info:', error);
    throw new Error('Failed to retrieve stage information');
  }
}

function generateParticipantId() {
  // Generate a unique participant ID (alphanumeric, hyphen, underscore only)
  return crypto.randomBytes(8).toString('hex');
}

exports.handler = async (event) => {
  try {
    // Get private key from Secrets Manager
    const privateKey = await getPrivateKey();
    
    // Get stage information
    const stageInfo = await getStageInfo();
    
    // Get origin from request headers for CORS
    const origin = event.headers?.origin || event.headers?.Origin || '*';
    
    const capabilities = {
      allow_publish: false,
      allow_subscribe: true
    };

    const now = Math.floor(Date.now() / 1000);
    
    // Create JWT payload for Amazon IVS Real-Time Streaming Stage
    const payload = {
      exp: now + 5, // expires in 5 seconds
      iat: now,
      jti: generateParticipantId(), // unique participant ID
      resource: stageArn,
      topic: stageInfo.stageId,
      events_url: stageInfo.eventsUrl,
      whip_url: stageInfo.whipUrl,
      capabilities: capabilities,
      version: "1.0"
    };

    // Create JWT header with kid (public key ARN)
    const header = {
      alg: "ES384",
      typ: "JWT",
      kid: publicKeyArn
    };
    
    // Sign the token with ES384 algorithm
    const token = jwt.sign(payload, privateKey, { 
      algorithm: 'ES384',
      header: header
    });
    
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': origin
      },
      body: JSON.stringify({
        token: token
      })
    };
  } catch (error) {
    console.error('Error generating token:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ 
        error: 'Failed to generate token',
        message: error.message 
      })
    };
  }
};
