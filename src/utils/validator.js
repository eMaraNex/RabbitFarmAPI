import Joi from 'joi';
import { HUTCH_LEVELS, HUTCH_SIZES, HUTCH_MATERIALS, DEFAULT_FEATURES } from './constants.js';

export const hutchSchema = Joi.object({
    id: Joi.string().max(50).required(),
    farm_id: Joi.string().uuid().required(),
    row_name: Joi.string().max(50).allow(null).optional(),
    level: Joi.string().valid(...HUTCH_LEVELS).required(),
    position: Joi.number().integer().positive().required(),
    size: Joi.string().valid(...HUTCH_SIZES).required(),
    material: Joi.string().valid(...HUTCH_MATERIALS).required(),
    features: Joi.array().items(Joi.string()).allow(null).default(DEFAULT_FEATURES),
    is_occupied: Joi.boolean().default(false),
    last_cleaned: Joi.date().iso().allow(null).default(null).optional(),
    created_at: Joi.date().iso().allow(null).default(null).optional(),
    updated_at: Joi.date().iso().allow(null).default(null).optional(),
    is_deleted: Joi.number().valid(0, 1).default(0)
}).strict();

export const hutchUpdateSchema = Joi.object({
    row_name: Joi.string().max(50).allow(null).optional(),
    level: Joi.string().valid(...HUTCH_LEVELS).optional(),
    position: Joi.number().integer().positive().optional(),
    size: Joi.string().valid(...HUTCH_SIZES).optional(),
    material: Joi.string().valid(...HUTCH_MATERIALS).optional(),
    features: Joi.array().items(Joi.string()).allow(null).optional(),
    is_occupied: Joi.boolean().optional(),
    last_cleaned: Joi.date().iso().allow(null).default(null).optional()
}).strict().min(1);

export const rowSchema = Joi.object({
    farm_id: Joi.string().uuid().required(),
    name: Joi.string().required(),
    description: Joi.string().allow(null),
    capacity: Joi.number().integer().min(1).required()
});

export const rowUpdateSchema = Joi.object({
    description: Joi.string().allow(null)
});

export const rabbitSchema = Joi.object({
    farm_id: Joi.string().uuid().required(),
    rabbit_id: Joi.string().required(),
    name: Joi.string().allow(null),
    gender: Joi.string().valid('male', 'female').required(),
    breed: Joi.string().required(),
    color: Joi.string().required(),
    birth_date: Joi.date().required(),
    weight: Joi.number().required(),
    hutch_id: Joi.string().allow(null),
    is_pregnant: Joi.boolean(),
    pregnancy_start_date: Joi.date().allow(null),
    expected_birth_date: Joi.date().allow(null),
    status: Joi.string(),
    notes: Joi.string().allow(null)
});

export const rabbitUpdateSchema = Joi.object({
    name: Joi.string().allow(null),
    gender: Joi.string().valid('male', 'female'),
    breed: Joi.string(),
    color: Joi.string(),
    birth_date: Joi.date(),
    weight: Joi.number(),
    hutch_id: Joi.string().allow(null),
    is_pregnant: Joi.boolean(),
    pregnancy_start_date: Joi.date().allow(null),
    expected_birth_date: Joi.date().allow(null),
    status: Joi.string(),
    notes: Joi.string().allow(null)
});

export const rabbitDeleteSchema = Joi.object({
    reason: Joi.string().required(),
    notes: Joi.string().allow(null),
    sale_amount: Joi.number().allow(null),
    sale_date: Joi.date().allow(null),
    sale_weight: Joi.number().allow(null),
    sold_to: Joi.string().allow(null)
});