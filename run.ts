import { v4 as uuid } from "uuid";
import { Post, PrismaClient, User } from "@prisma/client";

const prisma = new PrismaClient();

const USERS_TO_CREATE = 100;
const POSTS_TO_CREATE_PER_USER = 10_000;
const POSTS_PER_USER_TO_FETCH = 3;

const clearData = async () => {
  await prisma.post.deleteMany();
  await prisma.user.deleteMany();
};

const initData = async () => {
  // create some random data
  const newUsers = Array.from({ length: USERS_TO_CREATE }, () => ({
    id: uuid(),
  }));
  await prisma.user.createMany({
    data: newUsers,
  });

  const now = new Date().getTime();
  await Promise.all(
    newUsers.map(async (user) => {
      const posts = Array.from({ length: POSTS_TO_CREATE_PER_USER }, () => ({
        userId: user.id,
        // create random date to avoid multiple posts with the same timestamp
        createdAt: new Date(Math.floor(Math.random() * now)),
      }));
      await prisma.post.createMany({ data: posts });
    })
  );
};

const findByJoinLateral = async () => {
  const [users, posts] = await Promise.all([
    prisma.user.findMany({
      orderBy: {
        id: "asc",
      },
    }),
    prisma.$queryRaw`
      SELECT
        o.*
      FROM
        "User" u
      JOIN LATERAL (
        SELECT
          *
        FROM
          "Post" p
        WHERE
          u."id" = p."userId"
        ORDER BY
          p."createdAt" DESC
        LIMIT ${POSTS_PER_USER_TO_FETCH}
      ) o ON true
  ` as unknown as Promise<Post[]>,
  ]);

  const postsMap = posts.reduce((map, post) => {
    const { userId } = post;
    if (!map.has(userId)) {
      map.set(userId, []);
    }
    map.get(userId)?.push(post);
    return map;
  }, new Map<User["id"], Post[]>());

  return users.map((user) => ({
    ...user,
    posts: postsMap.get(user.id) ?? [],
  }));
};

const findByInclude = async () => {
  return prisma.user.findMany({
    orderBy: {
      id: "asc",
    },
    include: {
      posts: {
        take: POSTS_PER_USER_TO_FETCH,
        orderBy: {
          createdAt: "desc",
        },
      },
    },
  });
};

const start = async () => {
  await clearData();
  await initData();

  console.time("find many by lateral join");
  const usersWithPostsLateral = await findByJoinLateral();
  console.timeEnd("find many by lateral join");

  console.time("find many by include");
  const usersWithPostsInclude = await findByInclude();
  console.timeEnd("find many by include");

  console.log(
    "same result?",
    JSON.stringify(usersWithPostsInclude) ===
      JSON.stringify(usersWithPostsLateral)
  );
};

start();
