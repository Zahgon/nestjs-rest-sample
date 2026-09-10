/**
 * The OpenAPI description served at `/api-json` and rendered at `/api`.
 */
export const openApiDocument = {
  openapi: '3.0.0',
  paths: {
    '/': {
      get: {
        operationId: 'AppController_getHello',
        parameters: [],
        responses: {
          '200': {
            description: 'Returns hello world greeting.',
          },
        },
        tags: ['root'],
      },
    },
    '/posts': {
      get: {
        operationId: 'PostController_getAllPosts',
        parameters: [
          {
            name: 'q',
            required: false,
            in: 'query',
            description: 'Search keyword',
            schema: {
              type: 'string',
            },
          },
          {
            name: 'limit',
            required: false,
            in: 'query',
            description: 'Page size',
            schema: {
              example: 10,
              type: 'number',
            },
          },
          {
            name: 'skip',
            required: false,
            in: 'query',
            description: 'Offset',
            schema: {
              example: 0,
              type: 'number',
            },
          },
        ],
        responses: {
          '200': {
            description: 'List of posts.',
          },
        },
        tags: ['posts'],
      },
      post: {
        operationId: 'PostController_createPost',
        parameters: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreatePostDto',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Post created.',
          },
          '401': {
            description: 'Not authenticated.',
          },
          '403': {
            description: 'Insufficient permissions.',
          },
        },
        security: [
          {
            bearer: [],
          },
        ],
        tags: ['posts'],
      },
    },
    '/posts/{id}': {
      get: {
        operationId: 'PostController_getPostById',
        parameters: [
          {
            name: 'id',
            required: true,
            in: 'path',
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'Post found.',
          },
          '404': {
            description: 'Post not found.',
          },
        },
        tags: ['posts'],
      },
      put: {
        operationId: 'PostController_updatePost',
        parameters: [
          {
            name: 'id',
            required: true,
            in: 'path',
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/UpdatePostDto',
              },
            },
          },
        },
        responses: {
          '204': {
            description: 'Post updated.',
          },
          '401': {
            description: 'Not authenticated.',
          },
          '404': {
            description: 'Post not found.',
          },
        },
        security: [
          {
            bearer: [],
          },
        ],
        tags: ['posts'],
      },
      delete: {
        operationId: 'PostController_deletePostById',
        parameters: [
          {
            name: 'id',
            required: true,
            in: 'path',
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '204': {
            description: 'Post deleted.',
          },
          '401': {
            description: 'Not authenticated.',
          },
          '403': {
            description: 'Admin role required.',
          },
          '404': {
            description: 'Post not found.',
          },
        },
        security: [
          {
            bearer: [],
          },
        ],
        tags: ['posts'],
      },
    },
    '/posts/{id}/comments': {
      post: {
        operationId: 'PostController_createCommentForPost',
        parameters: [
          {
            name: 'id',
            required: true,
            in: 'path',
            schema: {
              type: 'string',
            },
          },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/CreateCommentDto',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Comment created.',
          },
          '401': {
            description: 'Not authenticated.',
          },
        },
        security: [
          {
            bearer: [],
          },
        ],
        tags: ['posts'],
      },
      get: {
        operationId: 'PostController_getAllCommentsOfPost',
        parameters: [
          {
            name: 'id',
            required: true,
            in: 'path',
            schema: {
              type: 'string',
            },
          },
        ],
        responses: {
          '200': {
            description: 'List of comments for the post.',
          },
        },
        tags: ['posts'],
      },
    },
    '/auth/login': {
      post: {
        operationId: 'AuthController_login',
        parameters: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  username: {
                    type: 'string',
                    example: 'hantsy',
                  },
                  password: {
                    type: 'string',
                    example: 'password',
                  },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Login successful.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponseDto',
                },
              },
            },
          },
          '401': {
            description: 'Invalid credentials.',
          },
        },
        tags: ['auth'],
      },
    },
    '/auth/refresh': {
      post: {
        operationId: 'AuthController_refresh',
        parameters: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RefreshTokenDto',
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Tokens refreshed successfully.',
            content: {
              'application/json': {
                schema: {
                  $ref: '#/components/schemas/LoginResponseDto',
                },
              },
            },
          },
          '401': {
            description: 'Invalid or expired refresh token.',
          },
        },
        tags: ['auth'],
      },
    },
    '/profile': {
      get: {
        operationId: 'ProfileController_getProfile',
        parameters: [],
        responses: {
          '200': {
            description: 'Current user profile.',
          },
          '401': {
            description: 'Not authenticated.',
          },
        },
        security: [
          {
            bearer: [],
          },
        ],
        tags: ['profile'],
      },
    },
    '/users/{id}': {
      get: {
        operationId: 'UserController_getUser',
        parameters: [
          {
            name: 'id',
            required: true,
            in: 'path',
            schema: {
              type: 'string',
            },
          },
          {
            name: 'withPosts',
            required: false,
            in: 'query',
            description: 'Include user posts',
            schema: {
              type: 'boolean',
            },
          },
        ],
        responses: {
          '200': {
            description: 'User found.',
          },
          '404': {
            description: 'User not found.',
          },
        },
        tags: ['users'],
      },
    },
    '/register': {
      post: {
        operationId: 'RegisterController_register',
        parameters: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                $ref: '#/components/schemas/RegisterDto',
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'User registered successfully.',
          },
          '409': {
            description: 'Username or email already exists.',
          },
        },
        tags: ['auth'],
      },
    },
  },
  info: {
    title: 'NestJS Sample API',
    description: 'Blog API with JWT authentication',
    version: '1.0',
    contact: {},
  },
  tags: [],
  servers: [],
  components: {
    securitySchemes: {
      bearer: {
        scheme: 'bearer',
        bearerFormat: 'JWT',
        type: 'http',
      },
    },
    schemas: {
      CreatePostDto: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            example: 'My First Post',
          },
          content: {
            type: 'string',
            example: 'This is the content of my first post.',
          },
        },
        required: ['title', 'content'],
      },
      UpdatePostDto: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            example: 'Updated Post Title',
          },
          content: {
            type: 'string',
            example: 'Updated content.',
          },
        },
        required: ['title', 'content'],
      },
      CreateCommentDto: {
        type: 'object',
        properties: {
          content: {
            type: 'string',
            example: 'Great post!',
          },
        },
        required: ['content'],
      },
      LoginResponseDto: {
        type: 'object',
        properties: {
          access_token: {
            type: 'string',
            example: 'eyJhbGciOiJIUzI1NiIs...',
            description: 'JWT access token (short-lived)',
          },
          refresh_token: {
            type: 'string',
            example: 'eyJhbGciOiJIUzI1NiIs...',
            description: 'JWT refresh token (long-lived)',
          },
        },
        required: ['access_token', 'refresh_token'],
      },
      RefreshTokenDto: {
        type: 'object',
        properties: {
          refresh_token: {
            type: 'string',
            example: 'eyJhbGciOiJIUzI1NiIs...',
            description: 'The refresh token obtained at login',
          },
        },
        required: ['refresh_token'],
      },
      RegisterDto: {
        type: 'object',
        properties: {
          username: {
            type: 'string',
            example: 'john_doe',
          },
          email: {
            type: 'string',
            example: 'john@example.com',
          },
          password: {
            type: 'string',
            example: 'P@ssword123',
            minLength: 8,
            maxLength: 20,
          },
          firstName: {
            type: 'string',
            example: 'John',
          },
          lastName: {
            type: 'string',
            example: 'Doe',
          },
        },
        required: ['username', 'email', 'password'],
      },
    },
  },
};
