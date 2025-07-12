import { DatabaseHelper } from '../config/database.js';
import logger from '../middleware/logger.js';
import { ValidationError } from '../middleware/errors.js';
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../config/database.js';
import AlertService from './alerts.services.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

// Utility function to get UTC date as YYYY-MM-DD
function getUTCDateString(date) {
    return dayjs(date).utc().format('YYYY-MM-DD');
}

// Utility function to get local date as YYYY-MM-DD (default Africa/Nairobi)
function getLocalDateString(date, timezone = 'Africa/Nairobi') {
    return dayjs(date).tz(timezone).format('YYYY-MM-DD');
}

// Utility function to format date for display (default Africa/Nairobi)
function formatLocalDate(date, timezone = 'Africa/Nairobi') {
    return dayjs(date).tz(timezone).format('MMMM D, YYYY');
}

class BreedingService {
    static async createBreedingRecord(breedingData, userId) {
        const { farm_id, doe_id, buck_id, mating_date, expected_birth_date, notes, immediate_notify_date, alert_message } = breedingData;

        if (!farm_id || !doe_id || !buck_id || !mating_date || !expected_birth_date) {
            throw new ValidationError('Missing required breeding record fields');
        }

        // Validate immediate_notify_date if provided
        let notifyOnDate = immediate_notify_date;
        if (notifyOnDate && !dayjs(notifyOnDate, 'YYYY-MM-DD', true).isValid()) {
            throw new ValidationError('Invalid immediate_notify_date format; must be YYYY-MM-DD');
        }
        // Fallback to local date in Africa/Nairobi
        notifyOnDate = notifyOnDate || getLocalDateString(new Date(), 'Africa/Nairobi');

        try {
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

            // Parse mating_date as UTC
            const matingDateUTC = dayjs(mating_date).utc();

            // Check if the buck has served within the last 3 days
            const recentService = await DatabaseHelper.executeQuery(
                `SELECT 1 FROM breeding_records 
                 WHERE buck_id = $1 AND farm_id = $2 AND mating_date >= $3 AND is_deleted = 0`,
                [buck_id, farm_id, matingDateUTC.subtract(3, 'day').toDate()]
            );
            if (recentService.rows.length > 0) {
                throw new ValidationError('Buck has served within the last 3 days');
            }

            // Check if the doe was served within the last week post-weaning
            const recentDoeService = await DatabaseHelper.executeQuery(
                `SELECT actual_birth_date, number_of_kits FROM breeding_records 
                 WHERE doe_id = $1 AND farm_id = $2 AND actual_birth_date IS NOT NULL AND is_deleted = 0 
                 ORDER BY actual_birth_date DESC LIMIT 1`,
                [doe_id, farm_id]
            );
            if (recentDoeService.rows.length > 0) {
                const lastBirth = dayjs(recentDoeService.rows[0].actual_birth_date);
                const weaningDate = lastBirth.add(42, 'day');
                const oneWeekAfterWeaning = weaningDate.add(7, 'day');
                if (matingDateUTC.isBefore(oneWeekAfterWeaning)) {
                    throw new ValidationError('Doe cannot be served within 1 week of weaning');
                }
            }

            // Set alert date for pregnancy confirmation
            const alertDate = matingDateUTC.add(21, 'day').toDate();

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

            // Get hutch_id for alerts
            const hutchResult = await DatabaseHelper.executeQuery(
                'SELECT hutch_id FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                [doe_id, farm_id]
            );
            const hutch_id = hutchResult.rows[0]?.hutch_id;

            // Create immediate breeding success alert
            const defaultMessage = `Breeding recorded for doe ${doe_id} and buck ${buck_id} on ${formatLocalDate(mating_date, 'Africa/Nairobi')}. Expected birth date: ${formatLocalDate(expected_birth_date, 'Africa/Nairobi')}`;
            await AlertService.createAlert({
                farm_id,
                user_id: userId,
                rabbit_id: doe_id,
                hutch_id,
                name: `Breeding Success for ${doe_id} and ${buck_id}`,
                alert_start_date: getUTCDateString(new Date()) + 'T00:00:00Z',
                alert_type: 'breeding',
                severity: 'medium',
                message: alert_message || defaultMessage,
                notify_on: [notifyOnDate]
            });

            // Create scheduled alerts (trigger day before and on the date)
            const alerts = [
                {
                    name: `Add Nesting Box for ${doe_id}`,
                    alert_start_date: getUTCDateString(matingDateUTC.add(26, 'day').toDate()) + 'T00:00:00Z',
                    alert_type: 'breeding',
                    severity: 'high',
                    message: `Add nesting box for rabbit ${doe_id} on hutch ${hutch_id || 'unknown'} by ${formatLocalDate(matingDateUTC.add(26, 'day'), 'Africa/Nairobi')}`,
                    notify_on: [
                        getUTCDateString(matingDateUTC.add(25, 'day').toDate()),
                        getUTCDateString(matingDateUTC.add(26, 'day').toDate())
                    ]
                },
                // Birth check alerts (days 28-31)
                ...Array.from({ length: 4 }, (_, i) => ({
                    name: `Check Birth for ${doe_id}`,
                    alert_start_date: getUTCDateString(matingDateUTC.add(28 + i, 'day').toDate()) + 'T00:00:00Z',
                    alert_type: 'birth',
                    severity: 'high',
                    message: `Check for birth of rabbit ${doe_id} on hutch ${hutch_id || 'unknown'} on ${formatLocalDate(matingDateUTC.add(28 + i, 'day'), 'Africa/Nairobi')}`,
                    notify_on: [
                        getUTCDateString(matingDateUTC.add(27 + i, 'day').toDate()),
                        getUTCDateString(matingDateUTC.add(28 + i, 'day').toDate())
                    ]
                }))
            ];

            for (const alert of alerts) {
                await AlertService.createAlert({
                    farm_id,
                    user_id: userId,
                    rabbit_id: doe_id,
                    hutch_id,
                    ...alert
                });
            }
            logger.info(`Breeding record created for doe ${doe_id} by user ${userId}`);
            return breedingRecord;
        } catch (error) {
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

    static async getBreedingHistoryByRabbitId(farmId, rabbitId) {
        try {
            const result = await DatabaseHelper.executeQuery(
                `SELECT br.*
                 FROM breeding_records br
                 WHERE br.doe_id = $1 AND br.farm_id = $2 AND br.is_deleted = 0`,
                [rabbitId, farmId]
            );
            if (result.rows.length === 0) {
                throw new ValidationError('Breeding record not found');
            }
            return result.rows;
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
        const { actual_birth_date, number_of_kits, notes } = updateData;

        try {
            const recordResult = await DatabaseHelper.executeQuery(
                'SELECT * FROM breeding_records WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
                [recordId, farmId]
            );
            if (recordResult.rows.length === 0) {
                throw new ValidationError('Breeding record not found');
            }
            const breedingRecord = recordResult.rows[0];

            // If actual birth date is provided, handle culling logic and cancel pregnancy alerts
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
                    const notificationId = uuidv4();
                    await DatabaseHelper.executeQuery(
                        `INSERT INTO notifications (id, user_id, type, title, message, data, priority, created_at, is_deleted)
                         VALUES ($1, $2, 'culling_alert', 'Doe Culling Alert', $3, $4, 'high', CURRENT_TIMESTAMP, 0)`,
                        [
                            notificationId,
                            userId,
                            `Doe ${breedingRecord.doe_id} recommended for culling due to low litter size (<5) over 3 generations.`,
                            JSON.stringify({ doe_id: breedingRecord.doe_id, farm_id: farmId })
                        ]
                    );
                    logger.info(`Doe ${breedingRecord.doe_id} marked for culling due to low litter size over 3 generations`);
                } else if (number_of_kits < 5 || number_of_kits > 10) {
                    const notificationId = uuidv4();
                    await DatabaseHelper.executeQuery(
                        `INSERT INTO notifications (id, user_id, type, title, message, data, priority, created_at, is_deleted)
                         VALUES ($1, $2, 'culling_alert', 'Doe Culling Alert', $3, $4, 'high', CURRENT_TIMESTAMP, 0)`,
                        [
                            notificationId,
                            userId,
                            `Doe ${breedingRecord.doe_id} recommended for culling due to litter size ${number_of_kits}.`,
                            JSON.stringify({ doe_id: breedingRecord.doe_id, farm_id: farmId })
                        ]
                    );
                    logger.info(`Doe ${breedingRecord.doe_id} marked for culling due to litter size ${number_of_kits}`);
                }

                // Update doe's pregnancy status
                await DatabaseHelper.executeQuery(
                    `UPDATE rabbits SET is_pregnant = false, pregnancy_start_date = NULL, expected_birth_date = NULL, actual_birth_date = $1, updated_at = CURRENT_TIMESTAMP
                     WHERE rabbit_id = $2 AND farm_id = $3 AND is_deleted = 0`,
                    [actual_birth_date, breedingRecord.doe_id, farmId]
                );

                // Cancel pregnancy-related alerts
                await DatabaseHelper.executeQuery(
                    `UPDATE alerts SET status = 'completed', updated_on = CURRENT_TIMESTAMP
                     WHERE rabbit_id = $1 AND alert_type = 'breeding' AND status = 'pending' AND is_deleted = false`,
                    [breedingRecord.doe_id]
                );

                // Get hutch_id for alerts
                const hutchResult = await DatabaseHelper.executeQuery(
                    'SELECT hutch_id FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [breedingRecord.doe_id, farmId]
                );
                const hutch_id = hutchResult.rows[0]?.hutch_id;

                // Create scheduled post-birth alerts
                const actualBirthDateUTC = dayjs(actual_birth_date).utc();
                const alerts = [
                    {
                        name: `Fostering Check for ${breedingRecord.doe_id}`,
                        alert_start_date: getUTCDateString(actualBirthDateUTC.add(4, 'day').toDate()) + 'T00:00:00Z',
                        alert_type: 'birth',
                        severity: 'medium',
                        message: `Check fostering needs for rabbit ${breedingRecord.doe_id} on hutch ${hutch_id || 'unknown'} by ${formatLocalDate(actualBirthDateUTC.add(4, 'day'), 'Africa/Nairobi')}`,
                        notify_on: [
                            getUTCDateString(actualBirthDateUTC.add(3, 'day').toDate()),
                            getUTCDateString(actualBirthDateUTC.add(4, 'day').toDate())
                        ]
                    },
                    {
                        name: `Remove Nesting Box for ${breedingRecord.doe_id}`,
                        alert_start_date: getUTCDateString(actualBirthDateUTC.add(20, 'day').toDate()) + 'T00:00:00Z',
                        alert_type: 'birth',
                        severity: 'medium',
                        message: `Remove nesting box for rabbit ${breedingRecord.doe_id} on hutch ${hutch_id || 'unknown'} by ${formatLocalDate(actualBirthDateUTC.add(20, 'day'), 'Africa/Nairobi')}`,
                        notify_on: [
                            getUTCDateString(actualBirthDateUTC.add(19, 'day').toDate()),
                            getUTCDateString(actualBirthDateUTC.add(20, 'day').toDate())
                        ]
                    },
                    {
                        name: `Wean Kits for ${breedingRecord.doe_id}`,
                        alert_start_date: getUTCDateString(actualBirthDateUTC.add(42, 'day').toDate()) + 'T00:00:00Z',
                        alert_type: 'birth',
                        severity: 'high',
                        message: `Wean kits for rabbit ${breedingRecord.doe_id} on hutch ${hutch_id || 'unknown'} by ${formatLocalDate(actualBirthDateUTC.add(42, 'day'), 'Africa/Nairobi')}`,
                        notify_on: [
                            getUTCDateString(actualBirthDateUTC.add(41, 'day').toDate()),
                            getUTCDateString(actualBirthDateUTC.add(42, 'day').toDate())
                        ]
                    }
                ];

                for (const alert of alerts) {
                    await AlertService.createAlert({
                        farm_id: farmId,
                        user_id: userId,
                        rabbit_id: breedingRecord.doe_id,
                        hutch_id,
                        ...alert
                    });
                }
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
            logger.info(`Breeding record ${recordId} updated by user ${userId}`);
            return updatedRecord;
        } catch (error) {
            logger.error(`Error updating breeding record ${recordId}: ${error.message}`);
            throw error;
        }
    }

    static async deleteBreedingRecord(recordId, farmId, userId) {
        try {
            const recordResult = await DatabaseHelper.executeQuery(
                'SELECT doe_id, actual_birth_date FROM breeding_records WHERE id = $1 AND farm_id = $2 AND is_deleted = 0',
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

                // Cancel related alerts
                await DatabaseHelper.executeQuery(
                    `UPDATE alerts SET status = 'rejected', updated_on = CURRENT_TIMESTAMP
                     WHERE rabbit_id = $1 AND alert_type IN ('breeding', 'birth') AND status = 'pending' AND is_deleted = false`,
                    [breedingRecord.doe_id]
                );
            }
            logger.info(`Breeding record ${recordId} soft deleted by user ${userId}`);
            return { id: recordId };
        } catch (error) {
            logger.error(`Error deleting breeding record ${recordId}: ${error.message}`);
            throw error;
        }
    }
    static async createKitRecord(kits, farm_id, userId) {
        const { kitz } = kits;
        try {
            // Validate farm exists
            const farmResult = await DatabaseHelper.executeQuery(
                'SELECT id FROM farms WHERE id = $1 AND is_deleted = 0',
                [farm_id]
            );
            if (farmResult.rows.length === 0) {
                throw new ValidationError('Farm not found');
            }

            // Validate kitz array
            if (!Array.isArray(kitz) || kitz.length === 0) {
                throw new ValidationError('kitz array is required and must not be empty');
            }

            // Validate each kit has required fields (only kit_number and breeding_record_id are mandatory)
            for (const kit of kitz) {
                if (!kit.breeding_record_id) {
                    throw new ValidationError('breeding_record_id is required for each kit');
                }
                if (!kit.kit_number) {
                    throw new ValidationError('kit_number is required for each kit');
                }
            }

            // Validate breeding_record_id
            const breedingRecordIds = [...new Set(kitz.map(kit => kit.breeding_record_id))];
            const breedingResult = await DatabaseHelper.executeQuery(
                'SELECT id, doe_id, number_of_kits FROM breeding_records WHERE id = ANY($1) AND farm_id = $2 AND is_deleted = 0',
                [breedingRecordIds, farm_id]
            );
            if (breedingResult.rows.length !== breedingRecordIds.length) {
                throw new ValidationError('One or more breeding records not found');
            }

            // Validate number of kitz doesn't exceed breeding record (with some flexibility)
            for (const record of breedingResult.rows) {
                const existingKits = await DatabaseHelper.executeQuery(
                    'SELECT COUNT(*) FROM kit_records WHERE breeding_record_id = $1 AND is_deleted = 0',
                    [record.id]
                );
                const currentKitCount = parseInt(existingKits.rows[0].count) || 0;
                const newKitsForRecord = kitz.filter(kit => kit.breeding_record_id === record.id).length;

                // Allow some flexibility - warn but don't block if slightly over
                if (currentKitCount + newKitsForRecord > (record.number_of_kits || 0) + 1) {
                    throw new ValidationError(`Total kits significantly exceed breeding record litter size for breeding record ${record.id}`);
                }
            }

            // Validate unique kit_numbers
            const kitNumbers = kitz.map(kit => kit.kit_number).filter(num => num);
            if (!kitNumbers.length) {
                throw new ValidationError('At least one valid kit number is required');
            }
            const existingKits = await DatabaseHelper.executeQuery(
                'SELECT kit_number FROM kit_records WHERE farm_id = $1 AND kit_number = ANY($2) AND is_deleted = 0',
                [farm_id, kitNumbers]
            );
            const duplicates = existingKits.rows.map(row => row.kit_number);
            if (duplicates.length > 0) {
                throw new ValidationError(`Duplicate kit numbers: ${duplicates.join(', ')}`);
            }

            // Validate parent IDs (only if provided)
            const parentIds = [...new Set(kitz.map(kit => [kit.parent_male_id, kit.parent_female_id]).flat().filter(id => id))];
            if (parentIds.length > 0) {
                const parentResult = await DatabaseHelper.executeQuery(
                    'SELECT rabbit_id, gender FROM rabbits WHERE farm_id = $1 AND rabbit_id = ANY($2) AND is_deleted = 0',
                    [farm_id, parentIds]
                );
                const foundIds = parentResult.rows.map(row => ({ rabbit_id: row.rabbit_id, gender: row.gender }));
                const missingIds = parentIds.filter(id => !foundIds.find(f => f.rabbit_id === id));
                if (missingIds.length > 0) {
                    console.warn(`Some parent IDs not found: ${missingIds.join(', ')}`);
                    throw new ValidationError(`Invalid parent IDs: ${missingIds.join(', ')}`);
                }

                // Validate doe is female (if doe ID is provided and found)
                const doeId = kitz[0].parent_female_id;
                if (doeId) {
                    const doe = foundIds.find(f => f.rabbit_id === doeId);
                    if (!doe || doe.gender !== 'female') {
                        throw new ValidationError(`Parent female ID ${doeId} is not a doe`);
                    }
                }
            }

            // Create or update rabbit_birth_history
            const insertedKits = [];
            for (const kit of kitz) {
                const {
                    breeding_record_id,
                    kit_number,
                    birth_weight,
                    gender,
                    color,
                    status,
                    parent_male_id,
                    parent_female_id,
                    notes,
                    actual_birth_date
                } = kit;

                // Validate breeding record matches doe and birth date
                const breedingRecord = breedingResult.rows.find(row => row.id === breeding_record_id);
                if (!breedingRecord) {
                    throw new ValidationError(`Breeding record ${breeding_record_id} not found`);
                }
                // Only validate doe match if parent_female_id is provided
                if (breedingRecord.doe_id !== kit.parent_female_id) {
                    throw new ValidationError(`Breeding record ${breeding_record_id} does not match doe ${kit.parent_female_id}`);
                }

                // Calculate weaning date (only if birth date is provided)
                let weaningDate = null;
                if (actual_birth_date) {
                    const actualBirthDateUTC = dayjs(actual_birth_date).utc();
                    weaningDate = actualBirthDateUTC.add(42, 'day').toDate();
                }

                // Insert into rabbit_birth_history if not exists
                const birthHistoryResult = await DatabaseHelper.executeQuery(
                    `SELECT id FROM rabbit_birth_history
                 WHERE breeding_record_id = $1 AND is_deleted = 0`,
                    [breeding_record_id]
                );
                let birthHistoryId = birthHistoryResult.rows[0]?.id;
                if (!birthHistoryId) {
                    birthHistoryId = uuidv4();
                    const newRabbitHistory = await DatabaseHelper.executeQuery(
                        `INSERT INTO rabbit_birth_history (
                       id, farm_id, doe_id, breeding_record_id, birth_date, number_of_kits, notes, created_at, is_deleted
                     ) VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP, 0)`,
                        [
                            birthHistoryId,
                            farm_id,
                            kit.parent_female_id || breedingRecord.doe_id,
                            breeding_record_id,
                            actual_birth_date,
                            kitz.filter(k => k.breeding_record_id === breeding_record_id).length,
                            notes || null
                        ]
                    );
                }

                // Insert kit with flexible validation
                const result = await DatabaseHelper.executeQuery(
                    `INSERT INTO kit_records (
                   id, breeding_record_id, farm_id, kit_number, birth_weight, gender, color, status,
                   weaning_date, parent_male_id, parent_female_id, notes, created_at, updated_at, is_deleted
                 ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, 0)
                 RETURNING id, kit_number`,
                    [
                        uuidv4(),
                        breeding_record_id,
                        farm_id,
                        kit_number,
                        birth_weight || null,
                        gender || null,
                        color || null,
                        status || 'alive',
                        weaningDate,
                        parent_male_id || null,
                        parent_female_id || null,
                        notes || null
                    ]
                );
                insertedKits.push(result.rows[0]);
            }

            // Create alert for relocating kits post-weaning
            const actualBirthDateUTC = dayjs(kitz[0].actual_birth_date).utc();
            const weaningDate = actualBirthDateUTC.add(42, 'day').toDate();
            const hutchResult = await DatabaseHelper.executeQuery(
                'SELECT hutch_id FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                [kitz[0].parent_female_id, farm_id]
            );
            const hutch_id = hutchResult.rows[0]?.hutch_id;

            await AlertService.createAlert({
                farm_id,
                user_id: userId,
                rabbit_id: kitz[0].parent_female_id,
                hutch_id,
                name: `Relocate Kits for ${kitz[0].parent_female_id}`,
                alert_start_date: getUTCDateString(weaningDate) + 'T00:00:00Z',
                alert_type: 'birth',
                severity: 'medium',
                message: `Relocate kits for rabbit ${kitz[0].parent_female_id} to individual hutches by ${formatLocalDate(weaningDate, 'Africa/Nairobi')}`,
                notify_on: [
                    getUTCDateString(dayjs(weaningDate).subtract(1, 'day').toDate()),
                    getUTCDateString(weaningDate)
                ]
            });
            logger.info(`Created ${insertedKits.length} kits for farm ${farm_id} by user ${userId}`);
            return {
                success: true,
                message: `${insertedKits.length} kits created successfully`,
                data: insertedKits
            };
        } catch (error) {
            logger.error(`Error creating bulk kits for farm ${farm_id}: ${error.message}`);
            return {
                success: false,
                message: error.message || 'Failed to create kits'
            };
        } finally {
            client.release();
        }
    }

    static async updateKitRecord(kitId, updateData, userId) {
        const { weaning_weight, status, notes, parent_male_id, parent_female_id, birth_weight, gender, color } = updateData;

        try {
            const kitResult = await DatabaseHelper.executeQuery(
                'SELECT kit_number, breeding_record_id, farm_id FROM kit_records WHERE id = $1 AND is_deleted = 0',
                [kitId]
            );
            if (kitResult.rows.length === 0) {
                throw new ValidationError('Kit record not found');
            }
            const kitRecord = kitResult.rows[0];

            // Validate parent IDs if provided (flexible validation)
            if (parent_male_id) {
                const maleResult = await DatabaseHelper.executeQuery(
                    'SELECT rabbit_id FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [parent_male_id, kitRecord.farm_id]
                );
                if (maleResult.rows.length === 0) {
                    console.warn(`Parent male rabbit ${parent_male_id} not found, but allowing update`);
                }
            }
            if (parent_female_id) {
                const femaleResult = await DatabaseHelper.executeQuery(
                    'SELECT rabbit_id, gender FROM rabbits WHERE rabbit_id = $1 AND farm_id = $2 AND is_deleted = 0',
                    [parent_female_id, kitRecord.farm_id]
                );
                if (femaleResult.rows.length === 0) {
                    console.warn(`Parent female rabbit ${parent_female_id} not found, but allowing update`);
                } else if (femaleResult.rows[0].gender !== 'female') {
                    throw new ValidationError('Parent female rabbit must be a doe (female)');
                }
            }

            // Validate birth_weight if provided
            if (birth_weight !== undefined && birth_weight !== null && birth_weight !== '') {
                const weightNum = parseFloat(birth_weight);
                if (isNaN(weightNum) || weightNum <= 0) {
                    throw new ValidationError('Birth weight must be a positive number');
                }
            }

            // Validate weaning_weight if provided
            if (weaning_weight !== undefined && weaning_weight !== null && weaning_weight !== '') {
                const weightNum = parseFloat(weaning_weight);
                if (isNaN(weightNum) || weightNum <= 0) {
                    throw new ValidationError('Weaning weight must be a positive number');
                }
            }

            const updatedKitResult = await DatabaseHelper.executeQuery(
                `UPDATE kit_records
                 SET weaning_weight = $1, status = $2, notes = $3, parent_male_id = $4, parent_female_id = $5, updated_at = CURRENT_TIMESTAMP
                 WHERE id = $6 AND is_deleted = 0
                 RETURNING *`,
                [
                    weaning_weight || null,
                    status || null,
                    notes || null,
                    parent_male_id || null,
                    parent_female_id || null,
                    kitId
                ]
            );

            if (updatedKitResult.rows.length === 0) {
                throw new ValidationError('Kit record not found or could not be updated');
            }

            const updatedKit = updatedKitResult.rows[0];
            logger.info(`Kit record ${kitId} updated by user ${userId}`);
            return updatedKit;
        } catch (error) {
            logger.error(`Error updating kit record ${kitId}: ${error.message}`);
            throw error;
        }
    }
}

export default BreedingService;