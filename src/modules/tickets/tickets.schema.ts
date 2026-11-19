/**
 * JSON-схеми модуля Tickets (spec-02, §7–§8): контракт HTTP без бізнес-логіки.
 */

import type { FastifySchema } from 'fastify';

import { TICKET_PRIORITIES, TICKET_STATUSES } from '../../core/domain.js';

const authorResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'displayName'],
  properties: {
    id: { type: 'integer' },
    displayName: { type: 'string' },
  },
};

const nullableAuthorResponse = {
  anyOf: [authorResponse, { type: 'null' }],
};

const ticketFields = {
  id: { type: 'integer' },
  title: { type: 'string' },
  description: { type: ['string', 'null'] },
  status: { type: 'string', enum: [...TICKET_STATUSES] },
  priority: { type: 'string', enum: [...TICKET_PRIORITIES] },
  reporterId: { type: 'integer' },
  assigneeId: { type: ['integer', 'null'] },
  createdAt: { type: 'string' },
  updatedAt: { type: 'string' },
};

const ticketResponse = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'title',
    'description',
    'status',
    'priority',
    'reporterId',
    'assigneeId',
    'createdAt',
    'updatedAt',
  ],
  properties: ticketFields,
};

const ticketListItemResponse = {
  type: 'object',
  additionalProperties: false,
  required: [
    'id',
    'title',
    'description',
    'status',
    'priority',
    'reporterId',
    'assigneeId',
    'createdAt',
    'updatedAt',
    'reporter',
    'assignee',
    'commentsCount',
  ],
  properties: {
    ...ticketFields,
    reporter: authorResponse,
    assignee: nullableAuthorResponse,
    commentsCount: { type: 'integer' },
  },
};

const commentResponse = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'ticketId', 'author', 'body', 'createdAt'],
  properties: {
    id: { type: 'integer' },
    ticketId: { type: 'integer' },
    author: authorResponse,
    body: { type: 'string' },
    createdAt: { type: 'string' },
  },
};

const ticketDetailsResponse = {
  type: 'object',
  additionalProperties: false,
  required: [
    ...ticketListItemResponse.required.filter((field) => field !== 'commentsCount'),
    'comments',
  ],
  properties: {
    ...ticketFields,
    reporter: authorResponse,
    assignee: nullableAuthorResponse,
    comments: { type: 'array', items: commentResponse },
  },
};

const ticketIdParams = {
  type: 'object',
  additionalProperties: false,
  required: ['id'],
  properties: { id: { type: 'integer', minimum: 1 } },
};

export const createTicketSchema: FastifySchema = {
  headers: {
    type: 'object',
    required: ['idempotency-key'],
    properties: {
      'idempotency-key': { type: 'string', minLength: 1, maxLength: 200 },
    },
  },
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['title'],
    properties: {
      title: { type: 'string', minLength: 3, maxLength: 200 },
      description: { type: 'string', maxLength: 5000 },
      priority: { type: 'string', enum: [...TICKET_PRIORITIES] },
    },
  },
  response: { 201: ticketResponse },
};

export const listTicketsSchema: FastifySchema = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      status: { type: 'string', enum: [...TICKET_STATUSES] },
      assigneeId: { type: 'integer', minimum: 1 },
    },
  },
  response: { 200: { type: 'array', items: ticketListItemResponse } },
};

export const getTicketSchema: FastifySchema = {
  params: ticketIdParams,
  response: { 200: ticketDetailsResponse },
};

export const updateTicketStatusSchema: FastifySchema = {
  params: ticketIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['status'],
    properties: { status: { type: 'string', enum: [...TICKET_STATUSES] } },
  },
  response: { 200: ticketResponse },
};

export const updateTicketAssigneeSchema: FastifySchema = {
  params: ticketIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['assigneeId'],
    properties: { assigneeId: { type: ['integer', 'null'], minimum: 1 } },
  },
  response: { 200: ticketResponse },
};

export const listCommentsSchema: FastifySchema = {
  params: ticketIdParams,
  response: { 200: { type: 'array', items: commentResponse } },
};

export const createCommentSchema: FastifySchema = {
  params: ticketIdParams,
  body: {
    type: 'object',
    additionalProperties: false,
    required: ['body'],
    properties: { body: { type: 'string', minLength: 1, maxLength: 5000 } },
  },
  response: { 201: commentResponse },
};
