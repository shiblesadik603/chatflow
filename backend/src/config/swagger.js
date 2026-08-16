import swaggerJsdoc from 'swagger-jsdoc';
import { env } from './env.js';

// swagger-jsdoc reads @openapi comment blocks directly above each route
// definition (see src/routes/*.js) and merges them into this base
// document. Comments live next to the code they describe specifically so
// they're far more likely to get updated the moment the route itself
// changes, instead of drifting out of sync in a separate docs file.
const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'ChatFlow API',
      version: '1.0.0',
      description:
        'REST API for ChatFlow, a real-time chat application. Real-time events ' +
        '(new_message, typing_start/stop, user_online/offline, message_delivered/read, ' +
        'message_edited/deleted) are delivered over Socket.IO, not REST - see README.md ' +
        'for the full event catalog and payload shapes.',
    },
    servers: [{ url: env.PUBLIC_URL, description: 'Current server' }],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'The accessToken returned by /api/auth/register or /api/auth/login.',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            message: { type: 'string', example: 'Resource not found' },
            errorCode: { type: 'string', example: 'RESOURCE_NOT_FOUND' },
            details: {
              type: 'object',
              description: 'Only present on 422 responses - field name mapped to an array of messages.',
              additionalProperties: { type: 'array', items: { type: 'string' } },
              example: { email: ['Enter a valid email address'] },
            },
          },
        },
        PublicUser: {
          type: 'object',
          description: 'What one user is allowed to see about another - never includes email or blockedUsers.',
          properties: {
            _id: { type: 'string', example: '64f1a2b3c4d5e6f7a8b9c0d1' },
            name: { type: 'string', example: 'Alice Johnson' },
            avatar: { type: 'string', example: 'http://localhost:5001/uploads/abc123.png' },
            bio: { type: 'string', example: 'Product designer, coffee enthusiast' },
            isOnline: { type: 'boolean', example: true },
            lastSeen: { type: 'string', format: 'date-time' },
          },
        },
        OwnUser: {
          type: 'object',
          description: "The requester's own profile - includes fields never shown to other users.",
          allOf: [
            { $ref: '#/components/schemas/PublicUser' },
            {
              type: 'object',
              properties: {
                email: { type: 'string', format: 'email', example: 'alice@example.com' },
                blockedUsers: { type: 'array', items: { type: 'string' } },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
              },
            },
          ],
        },
        Attachment: {
          type: 'object',
          properties: {
            url: { type: 'string', example: 'http://localhost:5001/uploads/xyz789.png' },
            fileName: { type: 'string', example: 'photo.png' },
            mimeType: { type: 'string', example: 'image/png' },
            size: { type: 'integer', example: 102400 },
            duration: { type: 'number', description: 'Seconds - voice messages only.', example: 12.5 },
          },
        },
        Message: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            conversation: { type: 'string' },
            sender: { $ref: '#/components/schemas/PublicUser' },
            content: { type: 'string', example: 'Hey, are you free later?' },
            messageType: { type: 'string', enum: ['text', 'image', 'file', 'voice', 'system'] },
            attachments: { type: 'array', items: { $ref: '#/components/schemas/Attachment' } },
            status: { type: 'string', enum: ['sent', 'delivered', 'read'] },
            isEdited: { type: 'boolean' },
            isDeleted: { type: 'boolean' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Conversation: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            type: { type: 'string', enum: ['private', 'group'] },
            participants: { type: 'array', items: { $ref: '#/components/schemas/PublicUser' } },
            group: { type: 'string', nullable: true, description: 'Group id - only set when type is "group".' },
            lastMessage: { $ref: '#/components/schemas/Message' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
        Group: {
          type: 'object',
          properties: {
            _id: { type: 'string' },
            name: { type: 'string', example: 'Weekend Trip' },
            description: { type: 'string' },
            avatar: { type: 'string' },
            admins: { type: 'array', items: { $ref: '#/components/schemas/PublicUser' } },
            members: { type: 'array', items: { $ref: '#/components/schemas/PublicUser' } },
            conversation: { type: 'string', description: 'The Conversation id messages are sent/read through.' },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
          },
        },
      },
      responses: {
        ValidationError: {
          description: 'Request body/query failed validation.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Validation failed',
                errorCode: 'VALIDATION_ERROR',
                details: { email: ['Enter a valid email address'] },
              },
            },
          },
        },
        Unauthorized: {
          description: 'Missing, invalid, or expired access token.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Not authenticated', errorCode: 'NOT_AUTHENTICATED' },
            },
          },
        },
        Forbidden: {
          description: 'Authenticated, but not allowed to perform this action.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'You are not part of this conversation', errorCode: 'NOT_A_PARTICIPANT' },
            },
          },
        },
        NotFound: {
          description: 'The resource does not exist.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Resource not found', errorCode: 'RESOURCE_NOT_FOUND' },
            },
          },
        },
        RateLimited: {
          description: 'Too many requests - see Phase 3/16 (Redis-backed rate limiting).',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: {
                success: false,
                message: 'Too many attempts, please try again later',
                errorCode: 'RATE_LIMITED',
              },
            },
          },
        },
        InvalidId: {
          description: 'A path parameter is not a well-formed MongoDB ObjectId.',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              example: { success: false, message: 'Invalid id', errorCode: 'INVALID_ID' },
            },
          },
        },
      },
      parameters: {
        IdParam: {
          name: 'id',
          in: 'path',
          required: true,
          schema: { type: 'string' },
          description: 'A MongoDB ObjectId.',
          example: '64f1a2b3c4d5e6f7a8b9c0d1',
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: ['./src/routes/*.js', './src/app.js'],
};

export const swaggerSpec = swaggerJsdoc(options);
