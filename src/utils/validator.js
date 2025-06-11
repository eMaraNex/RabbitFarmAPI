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
    name: Joi.string().trim().required(),
    farm_id: Joi.string().uuid().required(),
    description: Joi.string().allow(null).optional(),
    capacity: Joi.number().integer().min(1).required(),
    levels: Joi.array().items(Joi.string()).min(1).required(),
});

export const rowUpdateSchema = Joi.object({
    description: Joi.string().allow(null).required(),
});

export const rowExpandSchema = Joi.object({
    name: Joi.string().trim().required(),
    farm_id: Joi.string().uuid().required(),
    additionalCapacity: Joi.number().integer().min(1).required(),
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

export const breedingSchema = Joi.object({
    farm_id: Joi.string().uuid().required().messages({
        'string.uuid': 'farm_id must be a valid UUID',
        'any.required': 'farm_id is required'
    }),
    doe_id: Joi.string().max(20).required().messages({
        'string.max': 'doe_id must not exceed 20 characters',
        'any.required': 'doe_id is required'
    }),
    buck_id: Joi.string().max(20).required().messages({
        'string.max': 'buck_id must not exceed 20 characters',
        'any.required': 'buck_id is required'
    }),
    mating_date: Joi.date().required().messages({
        'date.base': 'mating_date must be a valid date',
        'any.required': 'mating_date is required'
    }),
    expected_birth_date: Joi.date().allow(null).optional().messages({
        'date.base': 'expected_birth_date must be a valid date'
    }),
    notes: Joi.string().allow(null).optional().messages({
        'string.base': 'notes must be a string'
    })
});

export const breedingUpdateSchema = Joi.object({
    actual_birth_date: Joi.date().allow(null).optional().messages({
        'date.base': 'actual_birth_date must be a valid date'
    }),
    number_of_kits: Joi.number().integer().min(0).allow(null).optional().messages({
        'number.base': 'number_of_kits must be a number',
        'number.integer': 'number_of_kits must be an integer',
        'number.min': 'number_of_kits must be greater than or equal to 0'
    }),
    notes: Joi.string().allow(null).optional().messages({
        'string.base': 'notes must be a string'
    })
}).min(1).messages({
    'object.min': 'At least one field is required for update'
});

export const kitSchema = Joi.object({
    breeding_record_id: Joi.string().uuid().required().messages({
        'string.uuid': 'breeding_record_id must be a valid UUID',
        'any.required': 'breeding_record_id is required'
    }),
    kit_number: Joi.number().integer().min(1).required().messages({
        'number.base': 'kit_number must be a number',
        'number.integer': 'kit_number must be an integer',
        'number.min': 'kit_number must be at least 1',
        'any.required': 'kit_number is required'
    }),
    birth_weight: Joi.number().precision(2).positive().allow(null).optional().messages({
        'number.base': 'birth_weight must be a number',
        'number.precision': 'birth_weight must have at most 2 decimal places',
        'number.positive': 'birth_weight must be a positive number'
    }),
    gender: Joi.string().valid('male', 'female').allow(null).optional().messages({
        'any.only': 'gender must be either "male" or "female"'
    }),
    color: Joi.string().max(50).allow(null).optional().messages({
        'string.max': 'color must not exceed 50 characters'
    }),
    status: Joi.string().max(20).allow(null).optional().messages({
        'string.max': 'status must not exceed 20 characters'
    }),
    notes: Joi.string().allow(null).optional().messages({
        'string.base': 'notes must be a string'
    })
});

export const kitUpdateSchema = Joi.object({
    weaning_weight: Joi.number().precision(2).positive().allow(null).optional().messages({
        'number.base': 'weaning_weight must be a number',
        'number.precision': 'weaning_weight must have at most 2 decimal places',
        'number.positive': 'weaning_weight must be a positive number'
    }),
    status: Joi.string().max(20).allow(null).optional().messages({
        'string.max': 'status must not exceed 20 characters'
    }),
    notes: Joi.string().allow(null).optional().messages({
        'string.base': 'notes must be a string'
    })
}).min(1).messages({
    'object.min': 'At least one field is required for update'
});