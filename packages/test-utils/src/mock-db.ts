import { mock } from "bun:test";
import type { Mock } from "bun:test";

// biome-ignore lint/suspicious/noExplicitAny: we want to allow any type of argument
type AnyMock = Mock<(...args: any[]) => any>;

/**
 * Standard method names present on every Prisma model delegate.
 * Derived from Prisma's generated client interface conventions.
 */
const PRISMA_DELEGATE_METHODS = [
	"findFirst",
	"findFirstOrThrow",
	"findUnique",
	"findUniqueOrThrow",
	"findMany",
	"create",
	"createMany",
	"createManyAndReturn",
	"update",
	"updateMany",
	"updateManyAndReturn",
	"upsert",
	"delete",
	"deleteMany",
	"count",
	"aggregate",
	"groupBy",
] as const;

type PrismaMethodName = (typeof PRISMA_DELEGATE_METHODS)[number];

/**
 * A mocked Prisma model delegate with all standard methods replaced by
 * bun:test `Mock` instances. Allows `.mockResolvedValue()`, `.mockReturnValue()`,
 * and all other bun:test mock APIs on each method.
 */
export type MockPrismaDelegate = Record<PrismaMethodName, AnyMock>;

const createMockDelegate = (): MockPrismaDelegate =>
	Object.fromEntries(
		PRISMA_DELEGATE_METHODS.map((method) => [method, mock()]),
	) as MockPrismaDelegate;

/**
 * A fully mocked database client covering all models in the application schema.
 *
 * Models are sourced from:
 * - App domain (packages/db/src/schemas/app.prisma)
 * - Auth domain (packages/db/src/schemas/auth.prisma)
 *
 * Each model exposes all standard Prisma delegate methods as vitest mocks.
 * Prisma client-level methods (`$connect`, `$disconnect`, etc.) are also mocked.
 */
export type MockDb = {
	// App domain models
	readonly providerInstallation: MockPrismaDelegate;
	readonly providerRepository: MockPrismaDelegate;
	readonly analysisRun: MockPrismaDelegate;
	readonly analysisRunAttempt: MockPrismaDelegate;
	readonly webhookDelivery: MockPrismaDelegate;
	// Auth domain models
	readonly user: MockPrismaDelegate;
	readonly session: MockPrismaDelegate;
	readonly account: MockPrismaDelegate;
	readonly verification: MockPrismaDelegate;
	readonly organization: MockPrismaDelegate;
	readonly member: MockPrismaDelegate;
	readonly invitation: MockPrismaDelegate;
	// Prisma client methods
	readonly $connect: AnyMock;
	readonly $disconnect: AnyMock;
	readonly $transaction: AnyMock;
	readonly $executeRaw: AnyMock;
	readonly $queryRaw: AnyMock;
	readonly $executeRawUnsafe: AnyMock;
	readonly $queryRawUnsafe: AnyMock;
};

/**
 * Creates a fresh `MockDb` instance with all model methods initialised as
 * `mock()`. Call this at the top of a test file.
 *
 * @example
 * ```ts
 * const mockDb = createMockDb();
 *
 * mock.module("@synk-ai/db", () => ({ db: mockDb }));
 *
 * beforeEach(() => {
 *   mock.restore();
 *   mockDb.session.findFirst.mockResolvedValue({ token: "t", userId: "u", expiresAt: new Date() });
 * });
 * ```
 */
export const createMockDb = (): MockDb => ({
	providerInstallation: createMockDelegate(),
	providerRepository: createMockDelegate(),
	analysisRun: createMockDelegate(),
	analysisRunAttempt: createMockDelegate(),
	webhookDelivery: createMockDelegate(),
	user: createMockDelegate(),
	session: createMockDelegate(),
	account: createMockDelegate(),
	verification: createMockDelegate(),
	organization: createMockDelegate(),
	member: createMockDelegate(),
	invitation: createMockDelegate(),
	$connect: mock(),
	$disconnect: mock(),
	$transaction: mock(),
	$executeRaw: mock(),
	$queryRaw: mock(),
	$executeRawUnsafe: mock(),
	$queryRawUnsafe: mock(),
});
