<?php

declare(strict_types=1);

namespace App\Domain\Data;

/**
 * A document attached to an application.
 *
 * Metadata only: there is no file storage yet, so `fileName` is a string and
 * nothing is uploaded anywhere. `kind` is what the screening matches against
 * the criteria's required-documents list.
 */
final readonly class ApplicationDocument
{
    public function __construct(
        public string $id,
        /** Matches an entry in EligibilityCriteria::$requiredDocuments. */
        public string $kind,
        public string $fileName,
        public string $uploadedAt,
        public bool $verified,
    ) {}
}
