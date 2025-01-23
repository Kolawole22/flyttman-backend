const cron = require("node-cron");
const db = require("../../db/connect");
const notificationService = require("../../utils/notificationService");
const emailService = require("../../utils/emailService");

const runAuctionCron = () => {
  cron.schedule("0 */6 * * *", () => {
    console.log("Running auction cron job...");

    try {
      const settingsQuery = `SELECT auction_enabled, fixed_percentage FROM settings LIMIT 1`;
      db.query(settingsQuery, (settingsErr, settingsResults) => {
        if (settingsErr) {
          console.error("Error fetching settings:", settingsErr);
          return;
        }

        if (!settingsResults || settingsResults.length === 0) {
          console.error(
            "Settings not configured. Please ensure auction_enabled and fixed_percentage are set."
          );
          return;
        }

        const { auction_enabled, fixed_percentage } = settingsResults[0];
        if (!auction_enabled) {
          console.log("Auction process is currently disabled.");
          return;
        }

        const openQuotationsQuery = `
          SELECT DISTINCT id, quotation_type 
          FROM (
            SELECT id, 'company_relocation' AS quotation_type, created_at FROM company_relocation WHERE status = 'open'
            UNION ALL
            SELECT id, 'move_out_cleaning', created_at FROM move_out_cleaning WHERE status = 'open'
            UNION ALL
            SELECT id, 'storage', created_at FROM storage WHERE status = 'open'
            UNION ALL
            SELECT id, 'heavy_lifting', created_at FROM heavy_lifting WHERE status = 'open'
            UNION ALL
            SELECT id, 'carrying_assistance', created_at FROM carrying_assistance WHERE status = 'open'
            UNION ALL
            SELECT id, 'junk_removal', created_at FROM junk_removal WHERE status = 'open'
            UNION ALL
            SELECT id, 'estate_clearance', created_at FROM estate_clearance WHERE status = 'open'
            UNION ALL
            SELECT id, 'evacuation_move', created_at FROM evacuation_move WHERE status = 'open'
            UNION ALL
            SELECT id, 'privacy_move', created_at FROM privacy_move WHERE status = 'open'
            UNION ALL
            SELECT id, 'moving_service', created_at FROM moving_service WHERE status = 'open'
          ) AS q
          WHERE TIMESTAMPDIFF(HOUR, created_at, NOW()) >= 6
        `;

        db.query(openQuotationsQuery, (quotationsErr, openQuotations) => {
          if (quotationsErr) {
            console.error("Error fetching open quotations:", quotationsErr);
            return;
          }

          if (!openQuotations || openQuotations.length === 0) {
            console.log("No open quotations eligible for auction.");
            return;
          }

          openQuotations.forEach((quotation) => {
            const bidsQuery = `
              SELECT b.*, s.email AS supplier_email, s.company_name AS supplier_name, 
                     c.email_address AS customer_email
              FROM bids b
              JOIN suppliers s ON b.supplier_id = s.id
              JOIN ${quotation.quotation_type} c ON b.quotation_id = c.id
              WHERE b.quotation_id = ? AND b.quotation_type = ? 
              ORDER BY b.bid_price ASC
            `;

            db.query(
              bidsQuery,
              [quotation.id, quotation.quotation_type],
              (bidsErr, bids) => {
                if (bidsErr) {
                  console.error(
                    `Error fetching bids for quotation ${quotation.id}:`,
                    bidsErr
                  );
                  return;
                }

                if (bids.length > 0) {
                  const winningBid = bids[0];
                  const finalPrice =
                    winningBid.bid_price * (1 + fixed_percentage / 100);
                  const escrowReleaseDate = winningBid.escrow_release_date;

                  const updateBidQuery = `
                    UPDATE bids 
                    SET status = 'accepted', total_price = ? 
                    WHERE id = ?
                  `;
                  db.query(
                    updateBidQuery,
                    [finalPrice, winningBid.id],
                    (updateBidErr) => {
                      if (updateBidErr) {
                        console.error(
                          `Error updating winning bid for quotation ${quotation.id}:`,
                          updateBidErr
                        );
                        return;
                      }

                      const updateQuotationQuery = `UPDATE ${quotation.quotation_type} SET status = 'awarded' WHERE id = ?`;
                      db.query(
                        updateQuotationQuery,
                        [quotation.id],
                        (updateQuotationErr) => {
                          if (updateQuotationErr) {
                            console.error(
                              `Error updating quotation status for ${quotation.id}:`,
                              updateQuotationErr
                            );
                            return;
                          }

                          const insertCommissionQuery = `
                            INSERT INTO admin_commission (bid_id, commission_percentage, final_price) 
                            VALUES (?, ?, ?)
                          `;
                          db.query(
                            insertCommissionQuery,
                            [winningBid.id, fixed_percentage, finalPrice],
                            async (commissionErr) => {
                              if (commissionErr) {
                                console.error(
                                  `Error inserting commission for bid ${winningBid.id}:`,
                                  commissionErr
                                );
                                return;
                              }

                              try {
                                await emailService.sendEmail(
                                  winningBid.supplier_email,
                                  emailService.templates.auctionWonSupplier({
                                    supplierName: winningBid.supplier_name,
                                    quotationType: quotation.quotation_type,
                                    quotationId: quotation.id,
                                    bidId: winningBid.id,
                                    finalPrice,
                                    escrowReleaseDate,
                                  })
                                );

                                await emailService.sendEmail(
                                  winningBid.customer_email,
                                  emailService.templates.auctionCompletedCustomer({
                                    supplierName: winningBid.supplier_name,
                                    quotationType: quotation.quotation_type,
                                    quotationId: quotation.id,
                                    bidPrice: winningBid.bid_price,
                                    escrowReleaseDate,
                                  })
                                );

                                console.log(
                                  `Processed auction for ${quotation.quotation_type} (ID: ${quotation.id}).`
                                );
                              } catch (emailErr) {
                                console.error(
                                  `Error sending email notifications for quotation ${quotation.id}:`,
                                  emailErr
                                );
                              }
                            }
                          );
                        }
                      );
                    }
                  );
                } else {
                  console.log(
                    `No bids found for ${quotation.quotation_type} (ID: ${quotation.id}).`
                  );
                }
              }
            );
          });
        });
      });
    } catch (error) {
      console.error("Error in auction cron job:", error);
    }
  });
};

module.exports = runAuctionCron;