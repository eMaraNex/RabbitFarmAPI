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
    rabbit_id: Joi.string().max(20).required(),
    hutch_id: Joi.string().max(50).required(),
    farm_id: Joi.string().uuid().required(),
    reason: Joi.string().max(100).required(),
    notes: Joi.string().max(1000).allow('', null).optional(),
    date: Joi.date().iso().required(),
    sale_amount: Joi.number().precision(2).optional(),
    sale_weight: Joi.number().precision(2).optional(),
    sold_to: Joi.string().max(100).allow('', null).optional(),
    sale_notes: Joi.string().max(1000).allow('', null).optional(),
    currency: Joi.string().length(3).optional(),
    sale_type: Joi.string().valid('whole', 'meat_only', 'skin_only', 'meat_and_skin').optional(),
}).options({ stripUnknown: true });

export const earningsSchema = Joi.object({
    farm_id: Joi.string().uuid().required(),
    type: Joi.string().valid('rabbit_sale', 'urine_sale', 'manure_sale', 'other').required(),
    rabbit_id: Joi.string().max(200).optional().allow(null), // Changed max to 200
    amount: Joi.number().positive().required(),
    currency: Joi.string().length(3).pattern(/^[A-Z]{3}$/).default('USD'),
    date: Joi.date().required(),
    weight: Joi.number().optional().allow(null),
    sale_type: Joi.string().optional().allow(null),
    includes_urine: Joi.boolean().default(false),
    includes_manure: Joi.boolean().default(false),
    buyer_name: Joi.string().max(100).optional().allow(null),
    notes: Joi.string().optional().allow(null),
    hutch_id: Joi.string().optional().allow(null),
});

export const earningsUpdateSchema = Joi.object({
    type: Joi.string().valid('rabbit_sale', 'urine_sale', 'manure_sale', 'other').optional(),
    rabbit_id: Joi.string().max(200).optional().allow(null), // Changed max to 200
    amount: Joi.number().positive().optional(),
    currency: Joi.string().length(3).pattern(/^[A-Z]{3}$/).optional(),
    date: Joi.date().optional(),
    weight: Joi.number().optional().allow(null),
    sale_type: Joi.string().optional().allow(null),
    includes_urine: Joi.boolean().optional(),
    includes_manure: Joi.boolean().optional(),
    buyer_name: Joi.string().max(100).optional().allow(null),
    notes: Joi.string().optional().allow(null),
    hutch_id: Joi.string().optional().allow(null),
});