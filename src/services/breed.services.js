import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';
import { v4 as uuidv4 } from 'uuid';

class BreedingService {
    static async createBreedingRecord(breedingData, userId) {
        const { farm_id, doe_id, buck_id, mating_date, expected_birth_date, notes } = breedingData;

        if (!farm_id || !doe_id || !buck_id || !mating_date || !expected_birth_date) {
            throw new ValidationError('Missing required breeding record fields');
        }

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            // Validate doe and buck
            const doeResult = await DatabaseHelper.executeQuery(
                'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND gender = $3 AND is_deleted = 0',
                [doe_id, farm_id, 'female']
            );
            if (doeResult.rows.length === 0) {
                throw new ValidationError('Doe not found or invalid');
            }

            const buckResult = await DatabaseHelper.executeQuery(
                'SELECT 1 FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND gender = $3 AND is_deleted = 0',
                [buck_id, farm_id, 'male']
            );
            if (buckResult.rows.length === 0) {
                throw new ValidationError('Buck not found or invalid');
            }

            // Check if the buck has served within the last 3 days (1 buck serves does 3 days apart)
            const recentService = await DatabaseHelper.executeQuery(
                `SELECT 1 FROM breeding_records 
                 WHERE buck_id = $1 AND farm_id = $2 AND mating_date >= $3 AND is_deleted = 0`,
                [buck_id, farm_id, new Date(new Date(mating_date).getTime() - 3 * 24 * 60 * 60 * 1000)]
            );
            if (recentService.rows.length > 0) {
                throw new ValidationError('Buck has served within the last 3 days');
            }

            // Check if the doe was served within the last week (post-weaning rule)
            const recentDoeService = await DatabaseHelper.executeQuery(
                `SELECT actual_birth_date, number_of_kits FROM breeding_records 
                 WHERE doe_id = $1 AND farm_id = $2 AND actual_birth_date IS NOT NULL AND is_deleted = 0 
                 ORDER BY actual_birth_date DESC LIMIT 1`,
                [doe_id, farm_id]
            );
            if (recentDoeService.rows.length > 0) {
                const lastBirth = new Date(recentDoeService.rows[0].actual_birth_date);
                const weaningDate = new Date(lastBirth.getTime() + 42 * 24 * 60 * 60 * 1000); // 6 weeks weaning
                const oneWeekAfterWeaning = new Date(weaningDate.getTime() + 7 * 24 * 60 * 60 * 1000);
                if (new Date(mating_date) < oneWeekAfterWeaning) {
                    throw new ValidationError('Doe cannot be served within 1 week of weaning');
                }
            }

            // Set alert date for pregnancy confirmation (21 days after mating)
            const alertDate = new Date(new Date(mating_date).getTime() + 21 * 24 * 60 * 60 * 1000);

            // Insert breeding record
            const breedingResult = await DatabaseHelper.executeQuery(
                `INSERT INTO breeding_records (id, farm_id, doe_id, buck_id, mating_date, expected_birth_date, notes, alert_date, created_at, is_deleted)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, 0) RETURNING *`,
                [uuidv4(), farm_id, doe_id, buck_id, mating_date, expected_birth_date, notes || null, alertDate]
            );
            const breedingRecord = breedingResult.rows[0];

            // Update doe's pregnancy status
            await DatabaseHelper.executeQuery(
                `UPDATE rabbits SET is_pregnant = true, pregnancy_start_date = $1, expected_birth_date = $2, updated_at = CURRENT_TIMESTAMP
                 WHERE rabbit_id = $3 AND farm_id = $4 AND is_deleted = 0`,
                [mating_date, expected_birth_date, doe_id, farm_id]
            );

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Breeding record created for doe ${doe_id} by user ${userId}`);
            return breedingRecord;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error creating breeding record: ${error.message}`);
            throw error;
        }
    }

    static async getBreedingRecordById(recordId, farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `SELECT br.*, 
                        (SELECT JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'id', kr.id,
                                'kit_number', kr.kit_number,
                                'birth_weight', kr.birth_weight,
                                'gender', kr.gender,
                                'color', kr.color,
                                'status', kr.status,
                                'weaning_date', kr.weaning_date,
                                'weaning_weight', kr.weaning_weight,
                                'notes', kr.notes
                            )
                        )
                        FROM kit_records kr
                        WHERE kr.breeding_record_id = br.id AND kr.is_deleted = 0) AS kits
                 FROM breeding_records br
                 WHERE br.id = $1 AND br.farm_id = $2 AND br.is_deleted = 0`,
                [recordId, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Breeding record not found');
            }
            return result.rows[0];
        } catch (error) {
            logger.error(`Error fetching breeding record ${recordId}: ${error.message}`);
            throw error;
        }
    }

    static async getAllBreedingRecords(farmId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `SELECT br.*,
                        (SELECT JSON_AGG(
                            JSON_BUILD_OBJECT(
                                'id', kr.id,
                                'kit_number', kr.kit_number,
                                'birth_weight', kr.birth_weight,
                                'gender', kr.gender,
                                'color', kr.color,
                                'status', kr.status,
                                'weaning_date', kr.weaning_date,
                                'weaning_weight', kr.weaning_weight,
                                'notes', kr.notes
                            )
                        )
                        FROM kit_records kr
                        WHERE kr.breeding_record_id = br.id AND kr.is_deleted = 0) AS kits
                 FROM breeding_records br
                 WHERE br.farm_id = $1 AND br.is_deleted = 0
                 ORDER BY br.created_at DESC`,
                [farmId]
            );
            return result.rows;
        } catch (error) {
            logger.error(`Error fetching breeding records for farm ${farmId}: ${error.message}`);
            throw error;
        }
    }

    static async updateBreedingRecord(recordId, farmId, updateData, userId) {
        const {
            actual_birth_date, number_of_kits, notes
        } = updateData;

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            const recordResult = await DatabaseHelper.executeQuery(
                'SELECT * FROM breeding_records WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                [recordId, farmId]
            );
            if (recordResult.rows.length === 0) {
                throw new ValidationError('Breeding record not found');
            }
            const breedingRecord = recordResult.rows[0];

            // If actual birth date is provided, handle kit culling logic
            if (actual_birth_date && number_of_kits) {
                // Check for culling based on litter size over 3 generations
                const pastRecords = await DatabaseHelper.executeQuery(
                    `SELECT number_of_kits FROM breeding_records 
                     WHERE doe_id = $1 AND farm_id = $2 AND actual_birth_date IS NOT NULL AND is_deleted = 0 
                     ORDER BY actual_birth_date DESC LIMIT 3`,
                    [breedingRecord.doe_id, farmId]
                );
                const litters = pastRecords.rows.map(r => r.number_of_kits || 0).filter(n => n > 0);
                if (litters.length >= 3 && litters.every(n => n < 5)) {
                    // TODO: Add culling alert/notification for the doe
                    logger.info(`Doe ${breedingRecord.doe_id} marked for culling due to low litter size over 3 generations`);
                } else if (number_of_kits < 5 || number_of_kits > 10) {
                    // TODO: Add culling alert/notification for the doe
                    logger.info(`Doe ${breedingRecord.doe_id} marked for culling due to litter size ${number_of_kits}`);
                }

                // Update doe's pregnancy status
                await DatabaseHelper.executeQuery(
                    `UPDATE rabbits SET is_pregnant = false, pregnancy_start_date = NULL, expected_birth_date = NULL, updated_at = CURRENT_TIMESTAMP
                     WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0`,
                    [breedingRecord.doe_id, farmId]
                );
            }

            // Update breeding record
            const updatedRecordResult = await DatabaseHelper.executeQuery(
                `UPDATE breeding_records SET actual_birth_date = $1, number_of_kits = $2, notes = $3, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $4 AND farm_id = $5 AND is_deleted = 0 RETURNING *`,
                [
                    actual_birth_date || breedingRecord.actual_birth_date,
                    number_of_kits || breedingRecord.number_of_kits,
                    notes || breedingRecord.notes,
                    recordId,
                    farmId
                ]
            );
            const updatedRecord = updatedRecordResult.rows[0];

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Breeding record ${recordId} updated by user ${userId}`);
            return updatedRecord;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error updating breeding record ${recordId}: ${error.message}`);
            throw error;
        }
    }

    static async deleteBreedingRecord(recordId, farmId, userId) {
        try {
            await DatabaseHelper.executeQuery('BEGIN');

            const recordResult = await DatabaseHelper.executeQuery(
                'SELECT doe_id FROM breeding_records WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                [recordId, farmId]
            );
            if (recordResult.rows.length === 0) {
                throw new ValidationError('Breeding record not found');
            }
            const breedingRecord = recordResult.rows[0];

            // Soft delete breeding record
            await DatabaseHelper.executeQuery(
                'UPDATE breeding_records SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                [recordId, farmId]
            );

            // Soft delete associated kit records
            await DatabaseHelper.executeQuery(
                'UPDATE kit_records SET is_deleted = 1, updated_at = CURRENT_TIMESTAMP WHERE breeding_record_id = $1 AND is_deleted = 0',
                [recordId]
            );

            // Update doe's pregnancy status if necessary
            if (!breedingRecord.actual_birth_date) {
                await DatabaseHelper.executeQuery(
                    `UPDATE rabbits SET is_pregnant = false, pregnancy_start_date = NULL, expected_birth_date = NULL, updated_at = CURRENT_TIMESTAMP
                     WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0`,
                    [breedingRecord.doe_id, farmId]
                );
            }

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Breeding record ${recordId} soft deleted by user ${userId}`);
            return { id: recordId };
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error deleting breeding record ${recordId}: ${error.message}`);
            throw error;
        }
    }


    static async createKitRecord(req, res) {
        const { farm_id } = req.params;
        const { kits } = req.body;
        const client = await pool.connect();

        try {
            await client.query("BEGIN");

            // Validate farm exists
            const farmResult = await client.query(
                "SELECT id FROM farms WHERE id = $1 AND is_deleted = 0",
                [farm_id]
            );
            if (farmResult.rows.length === 0) {
                throw new Error("Farm not found");
            }

            // Validate parent IDs
            const parentIds = [...new Set(kits.map((kit) => [kit.parent_male_id, kit.parent_female_id]).flat())].filter(Boolean);
            if (parentIds.length > 0) {
                const parentResult = await client.query(
                    "SELECT rabbit_id FROM rabbits WHERE farm_id = $1 AND rabbit_id = ANY($2) AND is_deleted = 0",
                    [farm_id, parentIds]
                );
                const foundIds = parentResult.rows.map((row) => row.rabbit_id);
                const missingIds = parentIds.filter((id) => !foundIds.includes(id));
                if (missingIds.length > 0) {
                    throw new Error(`Invalid parent IDs: ${missingIds.join(", ")}`);
                }
            }

            // Validate unique kit_numbers
            const kitNumbers = kits.map((kit) => kit.kit_number);
            const existingKits = await client.query(
                "SELECT kit_number FROM kit_records WHERE farm_id = $1 AND kit_number = ANY($2) AND is_deleted = 0",
                [farm_id, kitNumbers]
            );
            const duplicates = existingKits.rows.map((row) => row.kit_number);
            if (duplicates.length > 0) {
                throw new Error(`Duplicate kit numbers: ${duplicates.join(", ")}`);
            }

            // Insert kits
            const insertedKits = [];
            for (const kit of kits) {
                const {
                    kit_number,
                    birth_weight,
                    gender,
                    color,
                    status,
                    parent_male_id,
                    parent_female_id,
                    notes,
                } = kit;

                const result = await client.query(
                    `INSERT INTO kit_records (
          id, farm_id, kit_number, birth_weight, gender, color, status,
          parent_male_id, parent_female_id, notes, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        RETURNING id, kit_number`,
                    [
                        uuidv4(),
                        farm_id,
                        kit_number,
                        birth_weight,
                        gender,
                        color,
                        status,
                        parent_male_id,
                        parent_female_id,
                        notes,
                        new Date(),
                        new Date(),
                    ]
                );
                insertedKits.push(result.rows[0]);
            }

            await client.query("COMMIT");
            res.json({
                success: true,
                message: `${insertedKits.length} kits created successfully`,
                data: insertedKits,
            });
        } catch (error) {
            await client.query("ROLLBACK");
            console.error("Error creating bulk kits:", error);
            res.status(400).json({
                success: false,
                message: error.message || "Failed to create kits",
            });
        } finally {
            client.release();
        }
    };

    static async updateKitRecord(kitId, updateData, userId) {
        const { weaning_weight, status, notes, parent_male_id, parent_female_id } = updateData;

        try {
            await DatabaseHelper.executeQuery('BEGIN');

            const kitResult = await DatabaseHelper.executeQuery(
                'SELECT * FROM kit_records WHERE id = $1 AND is_deleted = 0',
                [kitId]
            );
            if (kitResult.rows.length === 0) {
                throw new ValidationError('Kit record not found');
            }
            const kitRecord = kitResult.rows[0];

            // Validate parent IDs if provided
            if (parent_male_id) {
                const maleResult = await DatabaseHelper.executeQuery(
                    'SELECT rabbit_id FROM rabbits WHERE rabbit_id = $1 AND is_deleted = 0',
                    [parent_male_id]
                );
                if (maleResult.rows.length === 0) {
                    throw new ValidationError('Parent male rabbit not found');
                }
            }
            if (parent_female_id) {
                const femaleResult = await DatabaseHelper.executeQuery(
                    'SELECT rabbit_id FROM rabbits WHERE rabbit_id = $1 AND is_deleted = 0',
                    [parent_female_id]
                );
                if (femaleResult.rows.length === 0) {
                    throw new ValidationError('Parent female rabbit not found');
                }
            }

            const updatedKitResult = await DatabaseHelper.executeQuery(
                `UPDATE kit_records
             SET
                 weaning_weight = $1,
                 status = $2,
                 notes = $3,
                 parent_male_id = $4,
                 parent_female_id = $5,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = $6 AND is_deleted = 0
             RETURNING *`,
                [
                    weaning_weight || kitRecord.weaning_weight,
                    status || kitRecord.status,
                    notes || kitRecord.notes,
                    parent_male_id || kitRecord.parent_male_id,
                    parent_female_id || kitRecord.parent_female_id,
                    kitId
                ]
            );
            const updatedKit = updatedKitResult.rows[0];

            await DatabaseHelper.executeQuery('COMMIT');
            logger.info(`Kit record ${kitId} updated by user ${userId}`);
            return updatedKit;
        } catch (error) {
            await DatabaseHelper.executeQuery('ROLLBACK');
            logger.error(`Error updating kit record ${kitId}: ${error.message}`);
            throw error;
        }
    }
}

export default BreedingService;